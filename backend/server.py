"""
Mahkota Graha KPR Monitoring - Backend API
PT Lider Bahtera Toolsindo
"""
import os
import uuid
import logging
import asyncio
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from typing import Annotated, List, Literal, Optional
from contextlib import asynccontextmanager

import bcrypt
import jwt
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

import reports

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me")
JWT_ALG = os.environ.get("JWT_ALGORITHM", "HS256")
TOKEN_MIN = int(os.environ.get("ACCESS_TOKEN_MINUTES", "480"))
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "mahkota-graha-kpr")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"

Role = Literal["admin_utama", "admin_kpr", "admin_legal", "admin_bangunan", "marketing"]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logger = logging.getLogger("mahkota")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

# --- Storage helpers ---
_storage_key: Optional[str] = None

def _init_storage_sync() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def _put_object_sync(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage_sync()
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key, "Content-Type": content_type},
                     data=data, timeout=120)
    if r.status_code == 503:
        globals()["_storage_key"] = None
        key = _init_storage_sync()
        r = requests.put(f"{STORAGE_URL}/objects/{path}",
                         headers={"X-Storage-Key": key, "Content-Type": content_type},
                         data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def _get_object_sync(path: str) -> tuple[bytes, str]:
    key = _init_storage_sync()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ============== Lifespan ==============
@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("username", unique=True)
    await db.kpr.create_index("id", unique=True)
    await db.units.create_index("blok_kavling", unique=True)
    await db.legality_unit.create_index("blok_kavling", unique=True)
    await seed_defaults()
    try:
        await run_in_threadpool(_init_storage_sync)
        logger.info("Storage initialized")
    except Exception as e:
        logger.warning(f"Storage init failed (will retry on first upload): {e}")
    yield
    client.close()


app = FastAPI(title="Mahkota Graha KPR API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============== Models ==============
class LoginIn(BaseModel):
    username: str
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict

class UserOut(BaseModel):
    username: str
    name: str
    role: Role
    active: bool

class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    role: Role
    marketing_name: Optional[str] = None

class SettingItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    order: int = 0
    extra: Optional[dict] = None

class SettingList(BaseModel):
    items: List[SettingItem]

class KprIn(BaseModel):
    nama_konsumen: str
    blok_kavling: str
    marketing: str
    bank_pemroses: str
    cabang_pemroses: str = ""
    tanggal_booking: str  # ISO date
    tahap_saat_ini: str
    tanggal_sp3k: Optional[str] = None
    tanggal_akad: Optional[str] = None
    keterangan: str = ""
    catatan_update: str = ""  # catatan proses untuk tahap saat ini (opsional), dicatat ke riwayat

class ChangePasswordIn(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=72)

class ResetPasswordIn(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=72)

class UnitIn(BaseModel):
    blok_kavling: str
    nama_kontraktor: str = ""
    tahap_konstruksi: str = ""
    tanggal_mulai: Optional[str] = None
    tanggal_target_selesai: Optional[str] = None
    tanggal_realisasi_selesai: Optional[str] = None
    kendala_catatan: str = ""
    link_foto_dokumentasi: str = ""

class LegalityUnitIn(BaseModel):
    blok_kavling: str
    status_sertifikat: str = ""
    nomor_sertifikat: str = ""
    status_imb_pbg: str = ""
    nomor_imb_pbg: str = ""
    status_pbb: str = ""
    nop: str = ""
    status_ssp_pph: str = ""
    status_bphtb: str = ""
    keterangan: str = ""

class LegalityProjectIn(BaseModel):
    sertifikat_tanah_induk: str = ""
    nomor_sertifikat: str = ""
    imb_pbg: str = ""
    nomor_imb_pbg: str = ""
    pkkpr: str = ""
    slf: str = ""
    catatan_umum: str = ""


# ============== Auth helpers ==============
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("ascii")

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("ascii"))
    except Exception:
        return False

def make_token(username: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": username, "iat": now, "exp": now + timedelta(minutes=TOKEN_MIN)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def current_user(credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]):
    err = HTTPException(status_code=401, detail="Invalid or expired credentials",
                        headers={"WWW-Authenticate": "Bearer"})
    if not credentials or credentials.scheme.lower() != "bearer":
        raise err
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        username = payload["sub"]
    except Exception:
        raise err
    user = await db.users.find_one({"username": username}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", False):
        raise err
    return user

def require_roles(*allowed: Role):
    async def dep(user=Depends(current_user)):
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user
    return dep

KPR_EDITORS: tuple = ("admin_utama", "admin_kpr", "marketing")

def assert_marketing_scope(user: dict, marketing_name: Optional[str]):
    """Role 'marketing' hanya boleh mengelola berkas atas nama marketingnya sendiri."""
    if user["role"] != "marketing":
        return
    own = user.get("marketing_name")
    if not own or marketing_name != own:
        raise HTTPException(403, f"Anda hanya bisa mengelola berkas marketing '{own or '-'}'")

async def log_kpr_history(kpr_id: str, user: dict, aksi: str, perubahan: list, catatan: str = ""):
    await db.kpr_history.insert_one({
        "id": str(uuid.uuid4()),
        "kpr_id": kpr_id,
        "aksi": aksi,
        "perubahan": perubahan,
        "catatan": catatan,
        "oleh": user["username"],
        "nama": user.get("name", user["username"]),
        "waktu": datetime.now(timezone.utc).isoformat(),
    })

KPR_TRACKED_FIELDS = {
    "tahap_saat_ini": "Tahap",
    "bank_pemroses": "Bank",
    "cabang_pemroses": "Cabang",
    "tanggal_sp3k": "Tgl SP3K",
    "tanggal_akad": "Tgl Akad",
    "tanggal_booking": "Tgl Booking",
    "marketing": "Marketing",
    "blok_kavling": "Blok",
    "nama_konsumen": "Nama Konsumen",
    "keterangan": "Keterangan",
}


# ============== Seed ==============
async def seed_defaults():
    # Admin
    existing = await db.users.find_one({"username": "admin"})
    if not existing:
        await db.users.insert_one({
            "username": "admin",
            "name": "Admin Utama",
            "password_hash": hash_password("Admin@123"),
            "role": "admin_utama",
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded default admin: admin / Admin@123")

    # Seed default settings
    defaults = {
        "marketing": [{"name": n, "order": i} for i, n in enumerate(["Rina", "Budi", "Siti", "Agus"])],
        "banks": [{"name": n, "order": i} for i, n in enumerate(["BTN", "BRI", "BNI", "Mandiri", "BJB"])],
        "branches": [{"name": n, "order": i} for i, n in enumerate(["Subang", "Bekasi", "Purwakarta"])],
        "kpr_stages": [{"name": n, "order": i} for i, n in enumerate(
            ["Pemberkasan", "Entry", "Dvo", "Ots", "Analis", "Approval", "Banding", "Reject", "Sp3k", "Akad"])],
        "construction_stages": [
            {"name": "Rencana Bangun", "order": 0, "extra": {"percent": 0}},
            {"name": "Pondasi", "order": 1, "extra": {"percent": 10}},
            {"name": "Sloof", "order": 2, "extra": {"percent": 20}},
            {"name": "Dinding", "order": 3, "extra": {"percent": 30}},
            {"name": "Kuda-kuda/Atap", "order": 4, "extra": {"percent": 40}},
            {"name": "Plafon", "order": 5, "extra": {"percent": 55}},
            {"name": "Lantai", "order": 6, "extra": {"percent": 65}},
            {"name": "Pengecatan", "order": 7, "extra": {"percent": 75}},
            {"name": "Instalasi Listrik/Air", "order": 8, "extra": {"percent": 85}},
            {"name": "Finishing", "order": 9, "extra": {"percent": 95}},
            {"name": "Serah Terima", "order": 10, "extra": {"percent": 100}},
        ],
        "legality_status": [{"name": n, "order": i} for i, n in enumerate(["Rencana", "Proses", "Done"])],
        "legality_doc_types": [{"name": n, "order": i} for i, n in enumerate(
            ["Sertifikat", "IMB/PBG", "PBB", "SSP/PPh", "BPHTB", "Sertifikat Tanah Induk", "PKKPR", "SLF", "Lainnya"])],
    }
    for key, items in defaults.items():
        if not await db.settings_lists.find_one({"key": key}):
            await db.settings_lists.insert_one({
                "key": key,
                "items": [{**it, "id": str(uuid.uuid4())} for it in items],
            })

    # Config
    if not await db.config.find_one({"key": "pemutihan_days"}):
        await db.config.insert_one({"key": "pemutihan_days", "value": 14})
    if not await db.config.find_one({"key": "project_info"}):
        await db.config.insert_one({"key": "project_info", "value": {
            "project_name": "Mahkota Graha Subang",
            "company_name": "PT Lider Bahtera Toolsindo",
        }})

    # Seed sample units
    if await db.units.count_documents({}) == 0:
        today = date.today()
        samples = [
            ("A-01", "Rencana Bangun", None),
            ("A-02", "Pondasi", 10),
            ("A-03", "Dinding", 30),
            ("A-04", "Kuda-kuda/Atap", 40),
            ("A-05", "Finishing", 95),
            ("B-01", "Rencana Bangun", 0),
            ("B-02", "Lantai", 65),
            ("B-03", "Pengecatan", 75),
        ]
        for blok, stage, _ in samples:
            await db.units.insert_one({
                "blok_kavling": blok,
                "nama_kontraktor": "CV Jaya Bangun",
                "tahap_konstruksi": stage,
                "tanggal_mulai": today.isoformat(),
                "tanggal_target_selesai": (today + timedelta(days=120)).isoformat(),
                "tanggal_realisasi_selesai": None,
                "kendala_catatan": "",
                "link_foto_dokumentasi": "",
                "foto_path": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

# ============== Helpers ==============
def strip_mongo(d: Optional[dict]) -> Optional[dict]:
    if not d:
        return d
    d.pop("_id", None)
    return d

async def get_construction_percent(stage_name: str) -> int:
    doc = await db.settings_lists.find_one({"key": "construction_stages"})
    if not doc:
        return 0
    for item in doc["items"]:
        if item["name"] == stage_name:
            return int((item.get("extra") or {}).get("percent", 0))
    return 0

async def get_kpr_stages_order() -> List[str]:
    doc = await db.settings_lists.find_one({"key": "kpr_stages"})
    if not doc:
        return []
    return [i["name"] for i in sorted(doc["items"], key=lambda x: x["order"])]

async def get_pemutihan_days() -> int:
    doc = await db.config.find_one({"key": "pemutihan_days"})
    return int(doc["value"]) if doc else 14

def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None

async def compute_kpr_status(record: dict) -> dict:
    """Returns record enriched with status + days_to_pemutihan"""
    pem_days = await get_pemutihan_days()
    stages = await get_kpr_stages_order()
    stage = record.get("tahap_saat_ini", "")
    booking = _parse_date(record.get("tanggal_booking"))
    sp3k = _parse_date(record.get("tanggal_sp3k"))
    akad = _parse_date(record.get("tanggal_akad"))

    sp3k_idx = next((i for i, s in enumerate(stages) if s.lower() == "sp3k"), None)
    cur_idx = next((i for i, s in enumerate(stages) if s == stage), None)
    has_sp3k = bool(sp3k) or (sp3k_idx is not None and cur_idx is not None and cur_idx >= sp3k_idx)

    today = date.today()
    deadline = (booking + timedelta(days=pem_days)) if booking else None
    days_left = (deadline - today).days if deadline else None

    if akad or stage.lower() == "akad":
        status_ = "DONE"
    elif record.get("diputihkan_manual"):
        status_ = "DIPUTIHKAN"
    elif not has_sp3k and booking and (today - booking).days > pem_days:
        status_ = "DIPUTIHKAN"
    elif has_sp3k:
        status_ = "SP3K"
    else:
        status_ = "PROSES"

    record["status"] = status_
    record["days_to_pemutihan"] = days_left
    record["has_sp3k"] = has_sp3k
    return record

async def compute_unit_status(unit: dict) -> dict:
    stage = unit.get("tahap_konstruksi", "")
    pct = await get_construction_percent(stage)
    unit["persen_progres"] = pct
    today = date.today()
    target = _parse_date(unit.get("tanggal_target_selesai"))
    realisasi = _parse_date(unit.get("tanggal_realisasi_selesai"))
    if pct >= 100 or realisasi:
        s = "DONE"
    elif pct == 0:
        s = "BELUM MULAI"
    elif target and today > target:
        s = "TERLAMBAT"
    else:
        s = "PROSES"
    unit["status_bangunan"] = s
    return unit


# ============== Auth routes ==============
@api_router.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn):
    user = await db.users.find_one({"username": data.username})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "Username atau password salah")
    if not user.get("active", False):
        raise HTTPException(403, "User inactive")
    return TokenOut(
        access_token=make_token(user["username"]),
        expires_in=TOKEN_MIN * 60,
        user={"username": user["username"], "name": user["name"], "role": user["role"],
              "marketing_name": user.get("marketing_name")},
    )

@api_router.get("/auth/me")
async def me(user=Depends(current_user)):
    return user

@api_router.post("/auth/password")
async def change_own_password(body: ChangePasswordIn, user=Depends(current_user)):
    doc = await db.users.find_one({"username": user["username"]}, {"password_hash": 1})
    if not doc or not verify_password(body.current_password, doc["password_hash"]):
        raise HTTPException(400, "Password saat ini salah")
    if verify_password(body.new_password, doc["password_hash"]):
        raise HTTPException(400, "Password baru harus berbeda dari password lama")
    await db.users.update_one({"username": user["username"]},
                              {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}

@api_router.post("/users/{username}/password")
async def admin_reset_password(username: str, body: ResetPasswordIn, _=Depends(require_roles("admin_utama"))):
    res = await db.users.update_one({"username": username},
                                    {"$set": {"password_hash": hash_password(body.new_password)}})
    if res.matched_count != 1:
        raise HTTPException(404, "User tidak ditemukan")
    return {"ok": True}

# ============== Users (Admin Utama) ==============
@api_router.get("/users")
async def list_users(_=Depends(require_roles("admin_utama"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users

@api_router.post("/users")
async def create_user(data: UserCreate, _=Depends(require_roles("admin_utama"))):
    if await db.users.find_one({"username": data.username}):
        raise HTTPException(400, "Username sudah ada")
    if data.role == "marketing" and not (data.marketing_name or "").strip():
        raise HTTPException(400, "Pilih nama marketing untuk akun role Marketing")
    await db.users.insert_one({
        "username": data.username,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": data.role,
        "marketing_name": (data.marketing_name or "").strip() or None,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

@api_router.delete("/users/{username}")
async def delete_user(username: str, _=Depends(require_roles("admin_utama"))):
    if username == "admin":
        raise HTTPException(400, "Tidak bisa hapus admin utama")
    await db.users.delete_one({"username": username})
    return {"ok": True}

# ============== Settings ==============
@api_router.get("/settings/lists/{key}")
async def get_settings_list(key: str, _=Depends(current_user)):
    doc = await db.settings_lists.find_one({"key": key}, {"_id": 0})
    if not doc:
        return {"key": key, "items": []}
    doc["items"] = sorted(doc["items"], key=lambda x: x.get("order", 0))
    return doc

@api_router.put("/settings/lists/{key}")
async def put_settings_list(key: str, body: SettingList, _=Depends(require_roles("admin_utama"))):
    items = [{**it.dict(), "id": it.id or str(uuid.uuid4())} for it in body.items]
    await db.settings_lists.update_one({"key": key}, {"$set": {"items": items}}, upsert=True)
    return {"ok": True}

@api_router.get("/settings/config/{key}")
async def get_config(key: str, _=Depends(current_user)):
    doc = await db.config.find_one({"key": key}, {"_id": 0})
    return doc or {"key": key, "value": None}

@api_router.put("/settings/config/{key}")
async def put_config(key: str, body: dict, _=Depends(require_roles("admin_utama"))):
    await db.config.update_one({"key": key}, {"$set": {"value": body.get("value")}}, upsert=True)
    return {"ok": True}

# ============== KPR ==============
@api_router.get("/kpr")
async def list_kpr(_=Depends(current_user)):
    rows = await db.kpr.find({}, {"_id": 0}).to_list(2000)
    for r in rows:
        await compute_kpr_status(r)
    return rows

async def apply_stage_rules(user: dict, new_data: dict, existing: Optional[dict]) -> dict:
    """Aturan tahap: marketing tidak boleh set SP3K/Akad & tidak boleh ubah tgl SP3K/Akad.
    Tgl SP3K / Akad terisi otomatis saat tahap berubah ke SP3K / Akad (jika kosong)."""
    stage = (new_data.get("tahap_saat_ini") or "").strip().lower()
    if user["role"] == "marketing":
        if stage in ("sp3k", "akad"):
            raise HTTPException(403, "Tahap SP3K dan Akad hanya bisa diubah oleh Admin KPR")
        new_data["tanggal_sp3k"] = (existing or {}).get("tanggal_sp3k")
        new_data["tanggal_akad"] = (existing or {}).get("tanggal_akad")
        return new_data
    today = date.today().isoformat()
    prev_stage = ((existing or {}).get("tahap_saat_ini") or "").strip().lower()
    if stage == "sp3k" and not new_data.get("tanggal_sp3k") and prev_stage != "sp3k":
        new_data["tanggal_sp3k"] = today
    if stage == "akad":
        if not new_data.get("tanggal_akad") and prev_stage != "akad":
            new_data["tanggal_akad"] = today
        if not new_data.get("tanggal_sp3k"):
            new_data["tanggal_sp3k"] = (existing or {}).get("tanggal_sp3k") or today
    return new_data

@api_router.post("/kpr")
async def create_kpr(data: KprIn, user=Depends(require_roles(*KPR_EDITORS))):
    assert_marketing_scope(user, data.marketing)
    # Validate unit: construction started AND unit not used by other
    unit = await db.units.find_one({"blok_kavling": data.blok_kavling})
    if not unit:
        raise HTTPException(400, f"Unit {data.blok_kavling} tidak ditemukan")
    pct = await get_construction_percent(unit.get("tahap_konstruksi", ""))
    if pct == 0:
        raise HTTPException(400, "Unit belum mulai dibangun (0%)")
    active = await _active_kpr_for_blok(data.blok_kavling)
    if active:
        raise HTTPException(400, f"Unit sudah dipakai konsumen: {active['nama_konsumen']}")
    rec = data.dict()
    catatan = (rec.pop("catatan_update", "") or "").strip()
    rec["keterangan_tahap"] = catatan
    rec = await apply_stage_rules(user, rec, None)
    rec["id"] = str(uuid.uuid4())
    rec["tanggal_update_terakhir"] = datetime.now(timezone.utc).isoformat()
    rec["created_by"] = user["username"]
    await db.kpr.insert_one(rec)
    rec.pop("_id", None)
    await log_kpr_history(rec["id"], user, "DIBUAT",
                          [{"field": "Tahap", "dari": None, "ke": rec["tahap_saat_ini"]}], catatan=catatan)
    return rec

@api_router.put("/kpr/{kpr_id}")
async def update_kpr(kpr_id: str, data: KprIn, user=Depends(require_roles(*KPR_EDITORS))):
    existing = await db.kpr.find_one({"id": kpr_id})
    if not existing:
        raise HTTPException(404, "Tidak ditemukan")
    assert_marketing_scope(user, existing.get("marketing"))
    assert_marketing_scope(user, data.marketing)
    new_data = data.dict()
    catatan = (new_data.pop("catatan_update", "") or "").strip()
    new_data = await apply_stage_rules(user, new_data, existing)
    changes = []
    for f, label in KPR_TRACKED_FIELDS.items():
        if (new_data.get(f) or None) != (existing.get(f) or None):
            changes.append({"field": label, "dari": existing.get(f), "ke": new_data.get(f)})
    stage_changed = new_data.get("tahap_saat_ini") != existing.get("tahap_saat_ini")
    note_changed = catatan != (existing.get("keterangan_tahap") or "")
    if stage_changed or note_changed:
        new_data["keterangan_tahap"] = catatan
    if stage_changed:
        new_data["tanggal_update_terakhir"] = datetime.now(timezone.utc).isoformat()
    await db.kpr.update_one({"id": kpr_id}, {"$set": new_data})
    if changes or (note_changed and catatan):
        await log_kpr_history(kpr_id, user, "DIUBAH", changes, catatan=catatan if (stage_changed or note_changed) else "")
    return {"ok": True}

@api_router.get("/kpr/{kpr_id}/history")
async def kpr_history(kpr_id: str, _=Depends(current_user)):
    rows = await db.kpr_history.find({"kpr_id": kpr_id}, {"_id": 0}).sort("waktu", -1).to_list(500)
    return rows

class PemutihanIn(BaseModel):
    alasan: str = ""

async def _active_kpr_for_blok(blok: str, exclude_id: Optional[str] = None) -> Optional[dict]:
    """Berkas aktif (bukan DIPUTIHKAN) yang memakai blok ini."""
    rows = await db.kpr.find({"blok_kavling": blok}, {"_id": 0}).to_list(100)
    for r in rows:
        if exclude_id and r["id"] == exclude_id:
            continue
        await compute_kpr_status(r)
        if r["status"] != "DIPUTIHKAN":
            return r
    return None

@api_router.post("/kpr/{kpr_id}/putihkan")
async def putihkan_kpr(kpr_id: str, body: PemutihanIn, user=Depends(require_roles("admin_utama", "admin_kpr"))):
    """Pemutihan manual: berkas dibatalkan & blok/kavling dilepas agar bisa dipakai konsumen baru."""
    rec = await db.kpr.find_one({"id": kpr_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Tidak ditemukan")
    await compute_kpr_status(rec)
    if rec["status"] == "DONE":
        raise HTTPException(400, "Berkas sudah akad, tidak bisa diputihkan")
    if rec["has_sp3k"]:
        raise HTTPException(400, "Berkas sudah SP3K, tidak bisa diputihkan")
    if rec["status"] == "DIPUTIHKAN" and rec.get("diputihkan_manual"):
        raise HTTPException(400, "Berkas sudah diputihkan")
    now = datetime.now(timezone.utc).isoformat()
    await db.kpr.update_one({"id": kpr_id}, {"$set": {
        "diputihkan_manual": True, "tanggal_pemutihan": now,
        "alasan_pemutihan": body.alasan.strip(), "diputihkan_oleh": user["username"],
        "tanggal_update_terakhir": now,
    }})
    await log_kpr_history(kpr_id, user, "DIPUTIHKAN",
                          [{"field": "Status", "dari": rec["status"], "ke": "DIPUTIHKAN"},
                           {"field": "Blok", "dari": rec["blok_kavling"], "ke": f"{rec['blok_kavling']} dilepas (tersedia)"}],
                          catatan=body.alasan.strip())
    return {"ok": True, "blok_kavling": rec["blok_kavling"]}

@api_router.post("/kpr/{kpr_id}/batal-putihkan")
async def batal_putihkan_kpr(kpr_id: str, user=Depends(require_roles("admin_utama", "admin_kpr"))):
    """Batalkan pemutihan manual; hanya jika blok belum dipakai berkas aktif lain."""
    rec = await db.kpr.find_one({"id": kpr_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Tidak ditemukan")
    if not rec.get("diputihkan_manual"):
        raise HTTPException(400, "Berkas ini tidak diputihkan secara manual")
    other = await _active_kpr_for_blok(rec["blok_kavling"], exclude_id=kpr_id)
    if other:
        raise HTTPException(400, f"Blok {rec['blok_kavling']} sudah dipakai konsumen baru: {other['nama_konsumen']}")
    await db.kpr.update_one({"id": kpr_id}, {
        "$unset": {"diputihkan_manual": "", "tanggal_pemutihan": "", "alasan_pemutihan": "", "diputihkan_oleh": ""},
        "$set": {"tanggal_update_terakhir": datetime.now(timezone.utc).isoformat()},
    })
    await log_kpr_history(kpr_id, user, "PEMUTIHAN DIBATALKAN",
                          [{"field": "Status", "dari": "DIPUTIHKAN", "ke": "aktif kembali"}])
    return {"ok": True}

@api_router.delete("/kpr/{kpr_id}")
async def delete_kpr(kpr_id: str, user=Depends(require_roles(*KPR_EDITORS))):
    rec = await db.kpr.find_one({"id": kpr_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Tidak ditemukan")
    assert_marketing_scope(user, rec.get("marketing"))
    await db.kpr_deleted_log.insert_one({
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "deleted_by": user["username"],
        "record": rec,
    })
    await db.kpr.delete_one({"id": kpr_id})
    return {"ok": True}

@api_router.get("/kpr/deleted-log")
async def deleted_log(_=Depends(require_roles("admin_utama"))):
    rows = await db.kpr_deleted_log.find({}, {"_id": 0}).sort("deleted_at", -1).to_list(500)
    return rows

# ============== Units ==============
@api_router.get("/units")
async def list_units(_=Depends(current_user)):
    rows = await db.units.find({}, {"_id": 0}).to_list(2000)
    for r in rows:
        await compute_unit_status(r)
    return rows

@api_router.get("/units/available")
async def available_units(_=Depends(current_user)):
    """Units with construction started AND no active KPR"""
    units = await db.units.find({}, {"_id": 0}).to_list(2000)
    kpr_rows = await db.kpr.find({}, {"_id": 0}).to_list(2000)
    used = set()
    for k in kpr_rows:
        enriched = await compute_kpr_status(dict(k))
        if enriched["status"] not in ("DIPUTIHKAN",):
            used.add(k["blok_kavling"])
    result = []
    for u in units:
        await compute_unit_status(u)
        if u["persen_progres"] > 0 and u["blok_kavling"] not in used:
            result.append(u)
    return result

@api_router.post("/units")
async def upsert_unit(data: UnitIn, _=Depends(require_roles("admin_utama", "admin_bangunan"))):
    rec = data.dict()
    rec["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.units.update_one({"blok_kavling": data.blok_kavling}, {"$set": rec}, upsert=True)
    return {"ok": True}

@api_router.put("/units/{blok}")
async def update_unit(blok: str, data: UnitIn, _=Depends(require_roles("admin_utama", "admin_bangunan"))):
    rec = data.dict()
    rec["updated_at"] = datetime.now(timezone.utc).isoformat()
    rec["blok_kavling"] = blok
    await db.units.update_one({"blok_kavling": blok}, {"$set": rec}, upsert=True)
    return {"ok": True}

@api_router.post("/units/{blok}/photo")
async def upload_unit_photo(blok: str, file: UploadFile = File(...), catatan: str = Form(""),
                             user=Depends(require_roles("admin_utama", "admin_bangunan"))):
    unit = await db.units.find_one({"blok_kavling": blok})
    if not unit:
        raise HTTPException(404, "Unit tidak ditemukan")
    content = await file.read()
    ext = (file.filename or "jpg").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{user['username']}/{uuid.uuid4()}.{ext}"
    content_type = file.content_type or f"image/{ext}"
    try:
        await run_in_threadpool(_put_object_sync, path, content, content_type)
    except Exception as e:
        logger.exception("Upload failed")
        raise HTTPException(500, f"Upload gagal: {e}")
    now = datetime.now(timezone.utc).isoformat()
    stage = unit.get("tahap_konstruksi", "")
    photo = {
        "id": str(uuid.uuid4()),
        "blok_kavling": blok,
        "path": path,
        "tahap_konstruksi": stage,
        "persen_progres": await get_construction_percent(stage),
        "catatan": catatan or "",
        "uploaded_by": user["username"],
        "uploaded_name": user.get("name", user["username"]),
        "uploaded_at": now,
    }
    await db.unit_photos.insert_one(dict(photo))
    await db.units.update_one({"blok_kavling": blok}, {"$set": {"foto_path": path, "updated_at": now}})
    return {"ok": True, "path": path, "photo": photo}

@api_router.get("/units/{blok}/photos")
async def list_unit_photos(blok: str, _=Depends(current_user)):
    rows = await db.unit_photos.find({"blok_kavling": blok}, {"_id": 0}).sort("uploaded_at", -1).to_list(500)
    return rows

@api_router.delete("/units/{blok}/photos/{photo_id}")
async def delete_unit_photo(blok: str, photo_id: str, _=Depends(require_roles("admin_utama", "admin_bangunan"))):
    photo = await db.unit_photos.find_one({"id": photo_id, "blok_kavling": blok})
    if not photo:
        raise HTTPException(404, "Foto tidak ditemukan")
    await db.unit_photos.delete_one({"id": photo_id})
    latest = await db.unit_photos.find_one({"blok_kavling": blok}, sort=[("uploaded_at", -1)])
    await db.units.update_one({"blok_kavling": blok},
                              {"$set": {"foto_path": latest["path"] if latest else None}})
    return {"ok": True}

@api_router.get("/files/{path:path}")
async def get_file(path: str, token: Optional[str] = Query(None), download: Optional[str] = Query(None),
                   credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)] = None):
    # Accept either bearer header or token query param (for web <img>)
    jwt_token = None
    if credentials and credentials.scheme.lower() == "bearer":
        jwt_token = credentials.credentials
    elif token:
        jwt_token = token
    if not jwt_token:
        raise HTTPException(401, "Auth required")
    try:
        jwt.decode(jwt_token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid token")
    try:
        content, ctype = await run_in_threadpool(_get_object_sync, path)
    except Exception:
        raise HTTPException(404, "File not found")
    headers = {}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{download}"'
    return Response(content=content, media_type=ctype, headers=headers)

# ============== Legality ==============
@api_router.get("/legality/units")
async def list_legality(_=Depends(current_user)):
    rows = await db.legality_unit.find({}, {"_id": 0}).to_list(2000)
    return rows

@api_router.put("/legality/units/{blok}")
async def update_legality(blok: str, data: LegalityUnitIn,
                           _=Depends(require_roles("admin_utama", "admin_legal"))):
    rec = data.dict()
    rec["blok_kavling"] = blok
    rec["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.legality_unit.update_one({"blok_kavling": blok}, {"$set": rec}, upsert=True)
    return {"ok": True}

@api_router.get("/legality/project")
async def get_legality_project(_=Depends(current_user)):
    doc = await db.legality_project.find_one({"key": "main"}, {"_id": 0})
    if not doc:
        return {"key": "main"}
    return doc

@api_router.put("/legality/project")
async def put_legality_project(data: LegalityProjectIn,
                                 _=Depends(require_roles("admin_utama", "admin_legal"))):
    await db.legality_project.update_one({"key": "main"},
        {"$set": {**data.dict(), "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"ok": True}

# --- Dokumen legalitas (scan/foto) ---
LEGAL_DOC_EXT = {"jpg", "jpeg", "png", "webp", "heic", "pdf"}

@api_router.get("/legality/docs")
async def list_legality_docs(scope: str = "unit", blok: Optional[str] = None, _=Depends(current_user)):
    q: dict = {"scope": scope}
    if scope == "unit" and blok:
        q["blok_kavling"] = blok
    rows = await db.legality_docs.find(q, {"_id": 0}).sort("uploaded_at", -1).to_list(1000)
    return rows

@api_router.post("/legality/docs")
async def upload_legality_doc(file: UploadFile = File(...), scope: str = Form("unit"),
                              blok_kavling: str = Form(""), jenis: str = Form("Lainnya"),
                              catatan: str = Form(""),
                              user=Depends(require_roles("admin_utama", "admin_legal"))):
    if scope not in ("unit", "project"):
        raise HTTPException(400, "scope harus unit/project")
    if scope == "unit" and not blok_kavling:
        raise HTTPException(400, "blok_kavling wajib diisi")
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(400, "Ukuran file maksimal 15 MB")
    ext = (file.filename or "jpg").rsplit(".", 1)[-1].lower()
    if ext not in LEGAL_DOC_EXT:
        raise HTTPException(400, "Format file harus JPG/PNG/WEBP/PDF")
    path = f"{APP_NAME}/legal/{scope}/{blok_kavling or 'proyek'}/{uuid.uuid4()}.{ext}"
    content_type = file.content_type or ("application/pdf" if ext == "pdf" else f"image/{ext}")
    try:
        await run_in_threadpool(_put_object_sync, path, content, content_type)
    except Exception as e:
        logger.exception("Upload dokumen legalitas gagal")
        raise HTTPException(500, f"Upload gagal: {e}")
    doc = {
        "id": str(uuid.uuid4()),
        "scope": scope,
        "blok_kavling": blok_kavling if scope == "unit" else None,
        "jenis": jenis or "Lainnya",
        "catatan": catatan or "",
        "nama_file": file.filename or f"dokumen.{ext}",
        "path": path,
        "content_type": content_type,
        "ukuran": len(content),
        "uploaded_by": user["username"],
        "uploaded_name": user.get("name", user["username"]),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.legality_docs.insert_one(dict(doc))
    return doc

@api_router.delete("/legality/docs/{doc_id}")
async def delete_legality_doc(doc_id: str, _=Depends(require_roles("admin_utama", "admin_legal"))):
    res = await db.legality_docs.delete_one({"id": doc_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Dokumen tidak ditemukan")
    return {"ok": True}

# ============== Dashboard ==============
@api_router.get("/dashboard")
async def dashboard(month: Optional[str] = None, marketing: Optional[str] = None,
                      _=Depends(current_user)):
    data = await build_dashboard_data(month, marketing)
    data.pop("kpr_rows", None)
    data.pop("units", None)
    data.pop("legality", None)
    return data

async def build_dashboard_data(month: Optional[str] = None, marketing: Optional[str] = None) -> dict:
    kpr_rows = await db.kpr.find({}, {"_id": 0}).to_list(2000)
    units = await db.units.find({}, {"_id": 0}).to_list(2000)
    legality = await db.legality_unit.find({}, {"_id": 0}).to_list(2000)

    # Filter kpr
    filtered = []
    for r in kpr_rows:
        await compute_kpr_status(r)
        if month:
            if not (r.get("tanggal_booking") or "").startswith(month):
                continue
        if marketing and r.get("marketing") != marketing:
            continue
        filtered.append(r)

    for u in units:
        await compute_unit_status(u)

    # KPIs
    total = len(filtered)
    proses = sum(1 for r in filtered if r["status"] == "PROSES")
    sp3k = sum(1 for r in filtered if r["status"] == "SP3K")
    done = sum(1 for r in filtered if r["status"] == "DONE")
    diputihkan = sum(1 for r in filtered if r["status"] == "DIPUTIHKAN")
    nearing = [r for r in filtered if r["status"] == "PROSES"
               and r.get("days_to_pemutihan") is not None and r["days_to_pemutihan"] <= 3]

    pct_sp3k = round((sp3k + done) * 100 / total, 1) if total else 0.0
    pct_done = round(done * 100 / total, 1) if total else 0.0
    avg_prog = round(sum(u["persen_progres"] for u in units) / len(units), 1) if units else 0.0

    # Per marketing
    by_marketing = {}
    for r in filtered:
        m = r.get("marketing", "-")
        g = by_marketing.setdefault(m, {"marketing": m, "total": 0, "proses": 0,
                                          "diputihkan": 0, "sp3k_done": 0, "avg_progress": 0})
        g["total"] += 1
        if r["status"] == "PROSES":
            g["proses"] += 1
        elif r["status"] == "DIPUTIHKAN":
            g["diputihkan"] += 1
        elif r["status"] in ("SP3K", "DONE"):
            g["sp3k_done"] += 1

    for g in by_marketing.values():
        units_m = [u for u in units if any(r["blok_kavling"] == u["blok_kavling"]
                                              and r.get("marketing") == g["marketing"] for r in filtered)]
        g["avg_progress"] = round(sum(u["persen_progres"] for u in units_m) / len(units_m), 1) if units_m else 0.0

    # Per bank
    by_bank = {}
    for r in filtered:
        b = r.get("bank_pemroses", "-")
        g = by_bank.setdefault(b, {"bank": b, "total": 0, "proses": 0, "sp3k_done": 0})
        g["total"] += 1
        if r["status"] == "PROSES":
            g["proses"] += 1
        elif r["status"] in ("SP3K", "DONE"):
            g["sp3k_done"] += 1

    # Unit summary
    used_bloks = {r["blok_kavling"] for r in kpr_rows if r.get("status") != "DIPUTIHKAN"}
    unit_summary = {
        "total": len(units),
        "belum_mulai": sum(1 for u in units if u["status_bangunan"] == "BELUM MULAI"),
        "proses": sum(1 for u in units if u["status_bangunan"] == "PROSES"),
        "terlambat": sum(1 for u in units if u["status_bangunan"] == "TERLAMBAT"),
        "done": sum(1 for u in units if u["status_bangunan"] == "DONE"),
        "avg_progress": avg_prog,
        "siap_dipasarkan": sum(1 for u in units if u["persen_progres"] > 0
                                 and u["blok_kavling"] not in used_bloks),
    }

    # Legality summary
    legal_fields = ["status_sertifikat", "status_imb_pbg", "status_pbb",
                     "status_ssp_pph", "status_bphtb"]
    legal_summary = {}
    for f in legal_fields:
        counts = {}
        for l in legality:
            v = l.get(f) or "-"
            counts[v] = counts.get(v, 0) + 1
        legal_summary[f] = counts

    return {
        "kpi": {
            "total": total, "proses": proses, "sp3k": sp3k,
            "done": done, "diputihkan": diputihkan,
            "pct_sp3k": pct_sp3k, "pct_done": pct_done,
            "avg_progress": avg_prog, "nearing_count": len(nearing),
        },
        "nearing": nearing,
        "by_marketing": list(by_marketing.values()),
        "by_bank": list(by_bank.values()),
        "unit_summary": unit_summary,
        "legal_summary": legal_summary,
        "kpr_rows": filtered,
        "units": units,
        "legality": legality,
    }

# ============== Laporan / Export ==============
def _decode_query_token(token: Optional[str],
                        credentials: Optional[HTTPAuthorizationCredentials]) -> str:
    jwt_token = None
    if credentials and credentials.scheme.lower() == "bearer":
        jwt_token = credentials.credentials
    elif token:
        jwt_token = token
    if not jwt_token:
        raise HTTPException(401, "Auth required")
    try:
        return jwt.decode(jwt_token, JWT_SECRET, algorithms=[JWT_ALG])["sub"]
    except Exception:
        raise HTTPException(401, "Invalid token")

REPORT_SECTIONS_BY_ROLE = {
    "admin_utama": ("kpr", "unit", "legal"),
    "admin_kpr": ("kpr",),
    "marketing": ("kpr",),
    "admin_bangunan": ("unit",),
    "admin_legal": ("legal",),
}

@api_router.get("/reports/monthly")
async def monthly_report(month: Optional[str] = None, marketing: Optional[str] = None,
                         format: str = "xlsx", token: Optional[str] = Query(None),
                         credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)] = None):
    username = _decode_query_token(token, credentials)
    user = await db.users.find_one({"username": username}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", False):
        raise HTTPException(401, "Invalid token")
    sections = REPORT_SECTIONS_BY_ROLE.get(user["role"], ())
    if user["role"] == "marketing":
        marketing = user.get("marketing_name") or "-"
    data = await build_dashboard_data(month, marketing)
    info = await db.config.find_one({"key": "project_info"}) or {}
    ctx = {
        "project_name": (info.get("value") or {}).get("project_name", "Mahkota Graha Subang"),
        "company_name": (info.get("value") or {}).get("company_name", "PT Lider Bahtera Toolsindo"),
        "month": month, "marketing": marketing,
        "sections": sections,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": user.get("name", username),
        **data,
    }
    label = f"laporan-{'-'.join(sections) or 'kpr'}-{month or 'semua'}" + (f"-{marketing}" if marketing else "")
    if format == "pdf":
        content = await run_in_threadpool(reports.build_pdf, ctx)
        media, ext = "application/pdf", "pdf"
    else:
        content = await run_in_threadpool(reports.build_xlsx, ctx)
        media, ext = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    return Response(content=content, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{label}.{ext}"'})

@api_router.get("/dashboard/combined-table")
async def combined_table(_=Depends(current_user)):
    """Unit-centric table: blok, consumer, berkas status, construction stage, progress, legal status"""
    units = await db.units.find({}, {"_id": 0}).to_list(2000)
    kpr = await db.kpr.find({}, {"_id": 0}).to_list(2000)
    legality = await db.legality_unit.find({}, {"_id": 0}).to_list(2000)

    kpr_by_blok = {}
    for r in kpr:
        await compute_kpr_status(r)
        prev = kpr_by_blok.get(r["blok_kavling"])
        # utamakan berkas aktif; berkas DIPUTIHKAN hanya tampil jika tidak ada yang aktif
        if prev is None or (prev["status"] == "DIPUTIHKAN" and r["status"] != "DIPUTIHKAN"):
            kpr_by_blok[r["blok_kavling"]] = r
    legal_by_blok = {l["blok_kavling"]: l for l in legality}

    out = []
    for u in units:
        await compute_unit_status(u)
        k = kpr_by_blok.get(u["blok_kavling"])
        l = legal_by_blok.get(u["blok_kavling"])
        out.append({
            "blok_kavling": u["blok_kavling"],
            "nama_konsumen": k.get("nama_konsumen") if k else None,
            "status_kpr": k.get("status") if (k and k.get("status") != "DIPUTIHKAN") else "TERSEDIA" if u["persen_progres"] > 0 else "BELUM SIAP",
            "tahap_konstruksi": u.get("tahap_konstruksi"),
            "persen_progres": u.get("persen_progres"),
            "status_bangunan": u.get("status_bangunan"),
            "status_sertifikat": (l or {}).get("status_sertifikat") or "-",
            "status_imb_pbg": (l or {}).get("status_imb_pbg") or "-",
            "marketing": (k or {}).get("marketing"),
        })
    return out

# ============== Health ==============
@api_router.get("/")
async def root():
    return {"message": "Mahkota Graha KPR API"}


app.include_router(api_router)
