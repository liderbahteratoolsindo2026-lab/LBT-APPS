"""
Mahkota Graha KPR Monitoring - Backend API
PT Lider Bahtera Toolsindo
"""
import os
import uuid
import base64
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
from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query, Header
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
    await db.projects.create_index("id", unique=True)
    try:
        existing_u = await db.users.index_information()
        if "email_1" in existing_u:
            await db.users.drop_index("email_1")
    except Exception:
        pass
    await db.users.create_index("email", unique=True,
                                partialFilterExpression={"email": {"$type": "string"}})
    # Unit & legalitas kini unik per (proyek, blok). Lepas index lama single-field bila ada.
    for coll in (db.units, db.legality_unit):
        try:
            existing = await coll.index_information()
            if "blok_kavling_1" in existing:
                await coll.drop_index("blok_kavling_1")
        except Exception:
            pass
    await db.units.create_index([("project_id", 1), ("blok_kavling", 1)], unique=True)
    await db.legality_unit.create_index([("project_id", 1), ("blok_kavling", 1)], unique=True)
    await db.ai_messages.create_index([("session_id", 1), ("waktu", 1)])
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
    email: Optional[str] = None

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
    new_password: str = Field(..., min_length=8, max_length=72)

class ResetPasswordIn(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=72)

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
    blok_kavling: Optional[str] = None
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

class ProjectIn(BaseModel):
    name: str
    company_name: str = "PT Lider Bahtera Toolsindo"
    alamat: str = ""
    active: bool = True


# ============== Auth helpers ==============
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("ascii")

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("ascii"))
    except Exception:
        return False

def validate_password(pw: str):
    """Kebijakan: min 8 karakter, wajib ada huruf & angka."""
    if not pw or len(pw) < 8:
        raise HTTPException(400, "Password minimal 8 karakter")
    if not any(c.isalpha() for c in pw):
        raise HTTPException(400, "Password harus mengandung huruf")
    if not any(c.isdigit() for c in pw):
        raise HTTPException(400, "Password harus mengandung angka")

LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15

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

async def get_default_project_id() -> Optional[str]:
    doc = await db.projects.find_one({}, sort=[("order", 1)])
    return doc["id"] if doc else None

async def current_project(x_project_id: Optional[str] = Header(None, alias="X-Project-Id")) -> str:
    if x_project_id:
        p = await db.projects.find_one({"id": x_project_id})
        if p:
            return x_project_id
    pid = await get_default_project_id()
    if not pid:
        raise HTTPException(500, "Belum ada proyek")
    return pid

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
            "must_change_password": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded default admin (must change password on first login)")

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
            "project_name": "Mahkota Graha I",
            "company_name": "PT Lider Bahtera Toolsindo",
        }})
    if not await db.config.find_one({"key": "marketing_targets"}):
        await db.config.insert_one({"key": "marketing_targets", "value": {}})

    # Proyek default (multi-proyek)
    if await db.projects.count_documents({}) == 0:
        await db.projects.insert_one({
            "id": str(uuid.uuid4()),
            "name": "Mahkota Graha I",
            "company_name": "PT Lider Bahtera Toolsindo",
            "alamat": "Subang",
            "order": 0,
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    default_pid = await get_default_project_id()

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
                "project_id": default_pid,
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
    # Reminder berkas macet: aktif (belum selesai) & tidak ada update > 7 hari
    stale = False
    if status_ in ("PROSES", "SP3K"):
        upd = record.get("tanggal_update_terakhir")
        last = None
        if upd:
            try:
                last = datetime.fromisoformat(upd.replace("Z", "+00:00"))
            except Exception:
                last = None
        if last is None:
            stale = True
        else:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            stale = (datetime.now(timezone.utc) - last).days > 7
    record["perlu_tindak_lanjut"] = stale
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
    now_dt = datetime.now(timezone.utc)
    if user:
        locked = user.get("locked_until")
        if locked:
            try:
                lu = datetime.fromisoformat(locked)
                if lu.tzinfo is None:
                    lu = lu.replace(tzinfo=timezone.utc)
            except Exception:
                lu = None
            if lu and lu > now_dt:
                mins = max(1, int((lu - now_dt).total_seconds() // 60) + 1)
                raise HTTPException(429, f"Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam {mins} menit.")
    if not user or not verify_password(data.password, user["password_hash"]):
        if user:
            attempts = int(user.get("failed_login_attempts", 0)) + 1
            upd: dict = {"failed_login_attempts": attempts}
            if attempts >= LOCKOUT_THRESHOLD:
                upd["locked_until"] = (now_dt + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            await db.users.update_one({"username": user["username"]}, {"$set": upd})
            sisa = LOCKOUT_THRESHOLD - attempts
            if 0 < sisa <= 2:
                raise HTTPException(401, f"Username atau password salah. Sisa {sisa} percobaan sebelum akun terkunci.")
        raise HTTPException(401, "Username atau password salah")
    if not user.get("active", False):
        raise HTTPException(403, "User inactive")
    if user.get("failed_login_attempts") or user.get("locked_until"):
        await db.users.update_one({"username": user["username"]},
                                  {"$set": {"failed_login_attempts": 0, "locked_until": None}})
    return TokenOut(
        access_token=make_token(user["username"]),
        expires_in=TOKEN_MIN * 60,
        user={"username": user["username"], "name": user["name"], "role": user["role"],
              "marketing_name": user.get("marketing_name"), "email": user.get("email"),
              "must_change_password": user.get("must_change_password", False)},
    )

@api_router.get("/auth/me")
async def me(user=Depends(current_user)):
    return user

@api_router.post("/auth/password")
async def change_own_password(body: ChangePasswordIn, user=Depends(current_user)):
    doc = await db.users.find_one({"username": user["username"]}, {"password_hash": 1})
    if not doc or not verify_password(body.current_password, doc["password_hash"]):
        raise HTTPException(400, "Password saat ini salah")
    validate_password(body.new_password)
    if verify_password(body.new_password, doc["password_hash"]):
        raise HTTPException(400, "Password baru harus berbeda dari password lama")
    await db.users.update_one({"username": user["username"]},
                              {"$set": {"password_hash": hash_password(body.new_password)},
                               "$unset": {"must_change_password": ""}})
    return {"ok": True}

@api_router.post("/users/{username}/password")
async def admin_reset_password(username: str, body: ResetPasswordIn, _=Depends(require_roles("admin_utama"))):
    validate_password(body.new_password)
    res = await db.users.update_one({"username": username},
                                    {"$set": {"password_hash": hash_password(body.new_password),
                                              "failed_login_attempts": 0, "locked_until": None}})
    if res.matched_count != 1:
        raise HTTPException(404, "User tidak ditemukan")
    return {"ok": True}

# ============== Social login (Google / Apple) ==============
class SessionIn(BaseModel):
    session_id: str

class AppleIn(BaseModel):
    identity_token: str
    email: Optional[str] = None
    name: Optional[str] = None

class EmailIn(BaseModel):
    email: Optional[str] = None

async def _login_by_email(email: Optional[str]) -> TokenOut:
    email = (email or "").strip().lower()
    if not email:
        raise HTTPException(403, "Email tidak tersedia dari penyedia login")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("active", False):
        raise HTTPException(403, f"Email {email} belum terdaftar. Hubungi Admin untuk didaftarkan.")
    return TokenOut(
        access_token=make_token(user["username"]),
        expires_in=TOKEN_MIN * 60,
        user={"username": user["username"], "name": user["name"], "role": user["role"],
              "marketing_name": user.get("marketing_name"), "email": user.get("email"),
              "must_change_password": user.get("must_change_password", False)},
    )

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

def _fetch_emergent_session_sync(session_id: str) -> dict:
    r = requests.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id}, timeout=30)
    if r.status_code != 200:
        raise HTTPException(401, "Sesi Google tidak valid atau kedaluwarsa")
    return r.json()

@api_router.post("/auth/session", response_model=TokenOut)
async def google_session(body: SessionIn):
    data = await run_in_threadpool(_fetch_emergent_session_sync, body.session_id)
    return await _login_by_email(data.get("email"))

APPLE_AUDIENCES = [a.strip() for a in os.environ.get("APPLE_AUDIENCES", "").split(",") if a.strip()]
_apple_jwks = jwt.PyJWKClient("https://appleid.apple.com/auth/keys")

def _verify_apple_sync(identity_token: str) -> dict:
    signing_key = _apple_jwks.get_signing_key_from_jwt(identity_token)
    return jwt.decode(identity_token, signing_key.key, algorithms=["RS256"],
                      audience=APPLE_AUDIENCES or None, issuer="https://appleid.apple.com")

@api_router.post("/auth/apple", response_model=TokenOut)
async def apple_login(body: AppleIn):
    try:
        claims = await run_in_threadpool(_verify_apple_sync, body.identity_token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Token Apple tidak valid")
    # Hanya percaya email dari klaim token terverifikasi (jangan pakai email dari client)
    email = claims.get("email")
    if not email:
        raise HTTPException(403, "Email Apple tidak tersedia pada token. Hubungi Admin untuk login manual.")
    if claims.get("email_verified") in (False, "false"):
        raise HTTPException(403, "Email Apple belum terverifikasi")
    return await _login_by_email(email)

@api_router.put("/users/{username}/email")
async def set_user_email(username: str, body: EmailIn, _=Depends(require_roles("admin_utama"))):
    email = (body.email or "").strip().lower() or None
    if email:
        other = await db.users.find_one({"email": email})
        if other and other["username"] != username:
            raise HTTPException(400, "Email sudah dipakai user lain")
        res = await db.users.update_one({"username": username}, {"$set": {"email": email}})
    else:
        res = await db.users.update_one({"username": username}, {"$unset": {"email": ""}})
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
    validate_password(data.password)
    if data.role == "marketing" and not (data.marketing_name or "").strip():
        raise HTTPException(400, "Pilih nama marketing untuk akun role Marketing")
    email = (data.email or "").strip().lower() or None
    if email and await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email sudah dipakai user lain")
    doc = {
        "username": data.username,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": data.role,
        "marketing_name": (data.marketing_name or "").strip() or None,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if email:
        doc["email"] = email
    await db.users.insert_one(doc)
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

# ============== Projects (Multi-proyek) ==============
@api_router.get("/projects")
async def list_projects(_=Depends(current_user)):
    rows = await db.projects.find({}, {"_id": 0}).sort("order", 1).to_list(200)
    return rows

@api_router.post("/projects")
async def create_project(data: ProjectIn, _=Depends(require_roles("admin_utama"))):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Nama proyek wajib diisi")
    n = await db.projects.count_documents({})
    doc = {"id": str(uuid.uuid4()), "name": name,
           "company_name": data.company_name.strip() or "PT Lider Bahtera Toolsindo",
           "alamat": data.alamat.strip(), "order": n, "active": data.active,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.projects.insert_one(dict(doc))
    return doc

@api_router.put("/projects/{pid}")
async def update_project(pid: str, data: ProjectIn, _=Depends(require_roles("admin_utama"))):
    res = await db.projects.update_one({"id": pid}, {"$set": {
        "name": data.name.strip(), "company_name": data.company_name.strip(),
        "alamat": data.alamat.strip(), "active": data.active}})
    if res.matched_count != 1:
        raise HTTPException(404, "Proyek tidak ditemukan")
    return {"ok": True}

@api_router.delete("/projects/{pid}")
async def delete_project(pid: str, _=Depends(require_roles("admin_utama"))):
    if await db.projects.count_documents({}) <= 1:
        raise HTTPException(400, "Minimal harus ada 1 proyek")
    cnt = (await db.kpr.count_documents({"project_id": pid})
           + await db.units.count_documents({"project_id": pid}))
    if cnt > 0:
        raise HTTPException(400, "Proyek masih memiliki data berkas/unit. Hapus datanya dulu.")
    await db.projects.delete_one({"id": pid})
    return {"ok": True}

# ---- Sinkron data dari Google Sheets (tambah/update, tidak menghapus) ----
_SYNC_SHEETS = {
    "kpr": "1y5VU4XjFPeiuH72jGo-lC4ofcSUGnQwX_-Tq0SUdCKI",
    "bangunan": "1XRn032jbUPV6b8-KYfcbekg2tZfXqephTRkvG8VIr38",
    "legal": "1LkaliA406Tf_YBjWwzWwokTW75jWvHYhJH9GVceSoAE",
}
_STAGE_CANON = {s.lower(): s for s in [
    "Rencana Bangun", "Pondasi", "Sloof", "Dinding", "Kuda-kuda/Atap", "Plafon",
    "Lantai", "Pengecatan", "Instalasi Listrik/Air", "Finishing", "Serah Terima"]}
_KPR_STAGE_CANON = {s.lower(): s for s in [
    "Pemberkasan", "Entry", "Dvo", "Ots", "Analis", "Approval", "Banding", "Reject", "Sp3k", "Akad"]}

def _parse_date_id(s):
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%d/%m/%y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None

def _fetch_sheets_sync():
    import csv as _csv
    import io as _io
    out = {}
    for k, sid in _SYNC_SHEETS.items():
        r = requests.get(f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv", timeout=60)
        r.raise_for_status()
        out[k] = list(_csv.reader(_io.StringIO(r.text)))
    return out

@api_router.post("/admin/sync-sheets")
async def sync_sheets(project_id: str = Depends(current_project), _=Depends(require_roles("admin_utama"))):
    try:
        sheets = await run_in_threadpool(_fetch_sheets_sync)
    except Exception as e:
        raise HTTPException(502, f"Gagal mengambil Google Sheets: {e}")
    now = datetime.now(timezone.utc).isoformat()
    n_unit = n_kpr = n_legal = 0

    # UNITS (tambah/update, pertahankan foto_path yang sudah ada)
    for r in sheets["bangunan"]:
        if len(r) < 11 or not r[1].strip().isdigit():
            continue
        blok = r[2].strip()
        if not blok:
            continue
        stage = _STAGE_CANON.get((r[5] or "").strip().lower(), (r[5] or "").strip().title() or "Rencana Bangun")
        await db.units.update_one(
            {"blok_kavling": blok, "project_id": project_id},
            {"$set": {"nama_kontraktor": r[4].strip(), "tahap_konstruksi": stage,
                      "tanggal_mulai": _parse_date_id(r[7]), "tanggal_target_selesai": _parse_date_id(r[8]),
                      "tanggal_realisasi_selesai": _parse_date_id(r[9]),
                      "kendala_catatan": (r[12].strip() if len(r) > 12 else ""),
                      "updated_at": now},
             "$setOnInsert": {"blok_kavling": blok, "project_id": project_id, "foto_path": None}},
            upsert=True)
        n_unit += 1

    # KPR (key: project+blok+nama; pertahankan field khusus app)
    started = False
    for r in sheets["kpr"]:
        if r and any("DAFTAR BERKAS" in (c or "") for c in r):
            started = True
            continue
        if not started or len(r) < 13:
            continue
        status_label = (r[6] or "").strip().upper()
        if status_label not in ("DONE", "PROSES", "DIPUTIHKAN"):
            continue
        nama = (r[1] or "").strip()
        blok = (r[3] or "").strip()
        if not nama or not blok:
            continue
        sp3k_date = _parse_date_id(r[10]) if len(r) > 10 else None
        tahap_raw = (r[12] or "").strip() if len(r) > 12 else ""
        tahap = _KPR_STAGE_CANON.get(tahap_raw.lower(), tahap_raw.title() or "Pemberkasan")
        set_fields = {"marketing": (r[4] or "").strip(), "tahap_saat_ini": tahap,
                      "tanggal_sp3k": sp3k_date, "keterangan": (r[7] or "").strip()}
        if tahap.lower() == "akad":
            set_fields["tanggal_akad"] = sp3k_date or now[:10]
        if status_label == "DIPUTIHKAN":
            set_fields["diputihkan_manual"] = True
            set_fields.setdefault("tanggal_pemutihan", now)
        await db.kpr.update_one(
            {"project_id": project_id, "blok_kavling": blok, "nama_konsumen": nama},
            {"$set": set_fields,
             "$setOnInsert": {"id": str(uuid.uuid4()), "project_id": project_id,
                              "blok_kavling": blok, "nama_konsumen": nama,
                              "bank_pemroses": "", "cabang_pemroses": "", "tanggal_booking": "",
                              "keterangan_tahap": "", "tanggal_update_terakhir": now, "created_by": "sync"}},
            upsert=True)
        n_kpr += 1

    # LEGALITAS
    for r in sheets["legal"]:
        if len(r) < 13 or not r[1].strip().isdigit():
            continue
        blok = (r[2] or "").strip()
        if not blok:
            continue
        await db.legality_unit.update_one(
            {"blok_kavling": blok, "project_id": project_id},
            {"$set": {"status_sertifikat": (r[4] or "").strip(), "nomor_sertifikat": (r[5] or "").strip(),
                      "status_imb_pbg": (r[6] or "").strip(), "nomor_imb_pbg": (r[7] or "").strip(),
                      "status_pbb": (r[8] or "").strip(), "nop": (r[9] or "").strip(),
                      "status_ssp_pph": (r[10] or "").strip(), "status_bphtb": (r[11] or "").strip(),
                      "keterangan": (r[12] or "").strip(), "updated_at": now},
             "$setOnInsert": {"blok_kavling": blok, "project_id": project_id}},
            upsert=True)
        n_legal += 1

    return {"ok": True, "units": n_unit, "kpr": n_kpr, "legalitas": n_legal,
            "pesan": f"Sinkron selesai: {n_unit} unit, {n_kpr} berkas, {n_legal} legalitas (tambah/update)."}

# ============== KPR ==============
@api_router.get("/kpr")
async def list_kpr(project_id: str = Depends(current_project), user=Depends(current_user)):
    q: dict = {"project_id": project_id}
    if user["role"] == "marketing":
        q["marketing"] = user.get("marketing_name")
    rows = await db.kpr.find(q, {"_id": 0}).to_list(2000)
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
async def create_kpr(data: KprIn, project_id: str = Depends(current_project),
                     user=Depends(require_roles(*KPR_EDITORS))):
    assert_marketing_scope(user, data.marketing)
    # Validate unit: construction started AND unit not used by other
    unit = await db.units.find_one({"blok_kavling": data.blok_kavling, "project_id": project_id})
    if not unit:
        raise HTTPException(400, f"Unit {data.blok_kavling} tidak ditemukan")
    pct = await get_construction_percent(unit.get("tahap_konstruksi", ""))
    if pct == 0:
        raise HTTPException(400, "Unit belum mulai dibangun (0%)")
    active = await _active_kpr_for_blok(data.blok_kavling, project_id=project_id)
    if active:
        raise HTTPException(400, f"Unit sudah dipakai konsumen: {active['nama_konsumen']}")
    rec = data.dict()
    rec["project_id"] = project_id
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
    if changes or note_changed:
        new_data["tanggal_update_terakhir"] = datetime.now(timezone.utc).isoformat()
    await db.kpr.update_one({"id": kpr_id}, {"$set": new_data})
    if changes or (note_changed and catatan):
        await log_kpr_history(kpr_id, user, "DIUBAH", changes, catatan=catatan if (stage_changed or note_changed) else "")
    return {"ok": True}

@api_router.get("/kpr/{kpr_id}/history")
async def kpr_history(kpr_id: str, user=Depends(current_user)):
    rec = await db.kpr.find_one({"id": kpr_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Berkas tidak ditemukan")
    if user["role"] == "marketing" and rec.get("marketing") != user.get("marketing_name"):
        raise HTTPException(403, "Tidak berhak melihat riwayat berkas ini")
    rows = await db.kpr_history.find({"kpr_id": kpr_id}, {"_id": 0}).sort("waktu", -1).to_list(500)
    return rows

class PemutihanIn(BaseModel):
    alasan: str = ""

async def _active_kpr_for_blok(blok: str, exclude_id: Optional[str] = None,
                               project_id: Optional[str] = None) -> Optional[dict]:
    """Berkas aktif (bukan DIPUTIHKAN) yang memakai blok ini."""
    q: dict = {"blok_kavling": blok}
    if project_id:
        q["project_id"] = project_id
    rows = await db.kpr.find(q, {"_id": 0}).to_list(100)
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
    other = await _active_kpr_for_blok(rec["blok_kavling"], exclude_id=kpr_id,
                                       project_id=rec.get("project_id"))
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
async def list_units(project_id: str = Depends(current_project), _=Depends(current_user)):
    rows = await db.units.find({"project_id": project_id}, {"_id": 0}).to_list(2000)
    for r in rows:
        await compute_unit_status(r)
    return rows

@api_router.get("/units/available")
async def available_units(project_id: str = Depends(current_project), _=Depends(current_user)):
    """Units with construction started AND no active KPR"""
    units = await db.units.find({"project_id": project_id}, {"_id": 0}).to_list(2000)
    kpr_rows = await db.kpr.find({"project_id": project_id}, {"_id": 0}).to_list(2000)
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
async def upsert_unit(data: UnitIn, project_id: str = Depends(current_project),
                      _=Depends(require_roles("admin_utama", "admin_bangunan"))):
    rec = data.dict()
    rec["project_id"] = project_id
    rec["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.units.update_one({"blok_kavling": data.blok_kavling, "project_id": project_id},
                              {"$set": rec}, upsert=True)
    return {"ok": True}

@api_router.put("/units/{blok}")
async def update_unit(blok: str, data: UnitIn, project_id: str = Depends(current_project),
                      _=Depends(require_roles("admin_utama", "admin_bangunan"))):
    rec = data.dict()
    rec["project_id"] = project_id
    rec["updated_at"] = datetime.now(timezone.utc).isoformat()
    rec["blok_kavling"] = blok
    await db.units.update_one({"blok_kavling": blok, "project_id": project_id},
                              {"$set": rec}, upsert=True)
    return {"ok": True}

@api_router.post("/units/{blok}/photo")
async def upload_unit_photo(blok: str, file: UploadFile = File(...), catatan: str = Form(""),
                             project_id: str = Depends(current_project),
                             user=Depends(require_roles("admin_utama", "admin_bangunan"))):
    unit = await db.units.find_one({"blok_kavling": blok, "project_id": project_id})
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
        "project_id": project_id,
        "path": path,
        "tahap_konstruksi": stage,
        "persen_progres": await get_construction_percent(stage),
        "catatan": catatan or "",
        "uploaded_by": user["username"],
        "uploaded_name": user.get("name", user["username"]),
        "uploaded_at": now,
    }
    await db.unit_photos.insert_one(dict(photo))
    await db.units.update_one({"blok_kavling": blok, "project_id": project_id},
                              {"$set": {"foto_path": path, "updated_at": now}})
    return {"ok": True, "path": path, "photo": photo}

@api_router.get("/units/{blok}/photos")
async def list_unit_photos(blok: str, project_id: str = Depends(current_project), _=Depends(current_user)):
    rows = await db.unit_photos.find({"blok_kavling": blok, "project_id": project_id},
                                     {"_id": 0}).sort("uploaded_at", -1).to_list(500)
    return rows

@api_router.delete("/units/{blok}/photos/{photo_id}")
async def delete_unit_photo(blok: str, photo_id: str, project_id: str = Depends(current_project),
                            _=Depends(require_roles("admin_utama", "admin_bangunan"))):
    photo = await db.unit_photos.find_one({"id": photo_id, "blok_kavling": blok, "project_id": project_id})
    if not photo:
        raise HTTPException(404, "Foto tidak ditemukan")
    await db.unit_photos.delete_one({"id": photo_id})
    latest = await db.unit_photos.find_one({"blok_kavling": blok, "project_id": project_id},
                                           sort=[("uploaded_at", -1)])
    await db.units.update_one({"blok_kavling": blok, "project_id": project_id},
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
async def list_legality(project_id: str = Depends(current_project), _=Depends(current_user)):
    rows = await db.legality_unit.find({"project_id": project_id}, {"_id": 0}).to_list(2000)
    return rows

@api_router.put("/legality/units/{blok}")
async def update_legality(blok: str, data: LegalityUnitIn, project_id: str = Depends(current_project),
                           _=Depends(require_roles("admin_utama", "admin_legal"))):
    rec = data.dict()
    rec["blok_kavling"] = blok
    rec["project_id"] = project_id
    rec["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.legality_unit.update_one({"blok_kavling": blok, "project_id": project_id},
                                      {"$set": rec}, upsert=True)
    return {"ok": True}

@api_router.get("/legality/project")
async def get_legality_project(project_id: str = Depends(current_project), _=Depends(current_user)):
    doc = await db.legality_project.find_one({"project_id": project_id}, {"_id": 0})
    if not doc:
        return {"project_id": project_id}
    return doc

@api_router.put("/legality/project")
async def put_legality_project(data: LegalityProjectIn, project_id: str = Depends(current_project),
                                 _=Depends(require_roles("admin_utama", "admin_legal"))):
    await db.legality_project.update_one({"project_id": project_id},
        {"$set": {**data.dict(), "project_id": project_id,
                  "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"ok": True}

# --- Dokumen legalitas (scan/foto) ---
LEGAL_DOC_EXT = {"jpg", "jpeg", "png", "webp", "heic", "pdf"}

@api_router.get("/legality/docs")
async def list_legality_docs(scope: str = "unit", blok: Optional[str] = None,
                             project_id: str = Depends(current_project), _=Depends(current_user)):
    q: dict = {"scope": scope, "project_id": project_id}
    if scope == "unit" and blok:
        q["blok_kavling"] = blok
    rows = await db.legality_docs.find(q, {"_id": 0}).sort("uploaded_at", -1).to_list(1000)
    return rows

@api_router.post("/legality/docs")
async def upload_legality_doc(file: UploadFile = File(...), scope: str = Form("unit"),
                              blok_kavling: str = Form(""), jenis: str = Form("Lainnya"),
                              catatan: str = Form(""), project_id: str = Depends(current_project),
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
        "project_id": project_id,
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
                      project_id: str = Depends(current_project), user=Depends(current_user)):
    if user["role"] == "marketing":
        marketing = user.get("marketing_name")
    data = await build_dashboard_data(month, marketing, project_id)
    data.pop("units", None)
    data.pop("legality", None)
    return data

async def build_dashboard_data(month: Optional[str] = None, marketing: Optional[str] = None,
                               project_id: Optional[str] = None) -> dict:
    pq = {"project_id": project_id} if project_id else {}
    kpr_rows = await db.kpr.find(pq, {"_id": 0}).to_list(2000)
    units = await db.units.find(pq, {"_id": 0}).to_list(2000)
    legality = await db.legality_unit.find(pq, {"_id": 0}).to_list(2000)

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
    pemberkasan = sum(1 for r in filtered
                      if (r.get("tahap_saat_ini") or "").strip().lower() == "pemberkasan"
                      and r["status"] not in ("DONE", "DIPUTIHKAN"))
    total_berjalan = total - done  # berkas yang masih berjalan (belum akad)
    nearing = [r for r in filtered if r["status"] == "PROSES"
               and r.get("days_to_pemutihan") is not None and r["days_to_pemutihan"] <= 3]
    macet = [r for r in filtered if r.get("perlu_tindak_lanjut")]

    pct_sp3k = round((sp3k + done) * 100 / total, 1) if total else 0.0
    pct_done = round(done * 100 / total, 1) if total else 0.0
    avg_prog = round(sum(u["persen_progres"] for u in units) / len(units), 1) if units else 0.0

    # Per marketing
    by_marketing = {}
    for r in filtered:
        m = r.get("marketing", "-")
        g = by_marketing.setdefault(m, {"marketing": m, "total": 0, "proses": 0,
                                          "sp3k": 0, "done": 0, "diputihkan": 0,
                                          "sp3k_done": 0, "avg_progress": 0})
        g["total"] += 1
        if r["status"] == "PROSES":
            g["proses"] += 1
        elif r["status"] == "DIPUTIHKAN":
            g["diputihkan"] += 1
        elif r["status"] == "SP3K":
            g["sp3k"] += 1
            g["sp3k_done"] += 1
        elif r["status"] == "DONE":
            g["done"] += 1
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
            "total": total, "total_berjalan": total_berjalan, "proses": proses, "sp3k": sp3k,
            "done": done, "diputihkan": diputihkan, "pemberkasan": pemberkasan,
            "pct_sp3k": pct_sp3k, "pct_done": pct_done,
            "avg_progress": avg_prog, "nearing_count": len(nearing),
            "macet_count": len(macet),
        },
        "nearing": nearing,
        "macet": macet,
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
                         format: str = "xlsx", project: Optional[str] = Query(None),
                         token: Optional[str] = Query(None),
                         credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)] = None):
    username = _decode_query_token(token, credentials)
    user = await db.users.find_one({"username": username}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", False):
        raise HTTPException(401, "Invalid token")
    project_id = None
    if project and await db.projects.find_one({"id": project}):
        project_id = project
    if not project_id:
        project_id = await get_default_project_id()
    proj = await db.projects.find_one({"id": project_id}) or {}
    sections = REPORT_SECTIONS_BY_ROLE.get(user["role"], ())
    if user["role"] == "marketing":
        marketing = user.get("marketing_name") or "-"
    data = await build_dashboard_data(month, marketing, project_id)
    # Riwayat perubahan berkas (untuk sheet audit)
    history = []
    if "kpr" in sections:
        ids = [r["id"] for r in data.get("kpr_rows", [])]
        if ids:
            hrows = await db.kpr_history.find({"kpr_id": {"$in": ids}}, {"_id": 0}).sort("waktu", -1).to_list(5000)
            name_by_id = {r["id"]: r.get("nama_konsumen", "") for r in data.get("kpr_rows", [])}
            blok_by_id = {r["id"]: r.get("blok_kavling", "") for r in data.get("kpr_rows", [])}
            for h in hrows:
                h["nama_konsumen"] = name_by_id.get(h["kpr_id"], "")
                h["blok_kavling"] = blok_by_id.get(h["kpr_id"], "")
            history = hrows
    ctx = {
        "project_name": proj.get("name", "Mahkota Graha I"),
        "company_name": proj.get("company_name", "PT Lider Bahtera Toolsindo"),
        "month": month, "marketing": marketing,
        "sections": sections,
        "history": history,
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
async def combined_table(project_id: str = Depends(current_project), user=Depends(current_user)):
    """Unit-centric table: blok, consumer, berkas status, construction stage, progress, legal status"""
    units = await db.units.find({"project_id": project_id}, {"_id": 0}).to_list(2000)
    kpr_q: dict = {"project_id": project_id}
    if user["role"] == "marketing":
        kpr_q["marketing"] = user.get("marketing_name")
    kpr = await db.kpr.find(kpr_q, {"_id": 0}).to_list(2000)
    legality = await db.legality_unit.find({"project_id": project_id}, {"_id": 0}).to_list(2000)

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

# ============== Dashboard Marketing ==============
@api_router.get("/dashboard/marketing")
async def marketing_dashboard(month: Optional[str] = None, marketing: Optional[str] = None,
                              project_id: str = Depends(current_project), user=Depends(current_user)):
    name = user.get("marketing_name") if user["role"] == "marketing" else (marketing or None)
    now_month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    rows = await db.kpr.find({"project_id": project_id}, {"_id": 0}).to_list(3000)
    mine = []
    for r in rows:
        await compute_kpr_status(r)
        if name and r.get("marketing") != name:
            continue
        mine.append(r)
    nearing = [r for r in mine if r["status"] == "PROSES"
               and r.get("days_to_pemutihan") is not None and r["days_to_pemutihan"] <= 3]
    macet_list = [r for r in mine if r.get("perlu_tindak_lanjut")]
    targets = (await db.config.find_one({"key": "marketing_targets"}) or {}).get("value") or {}
    target = int(targets.get(name or "", 0) or 0)
    return {
        "marketing": name,
        "total": len(mine),
        "proses": sum(1 for r in mine if r["status"] == "PROSES"),
        "sp3k": sum(1 for r in mine if r["status"] == "SP3K"),
        "done": sum(1 for r in mine if r["status"] == "DONE"),
        "diputihkan": sum(1 for r in mine if r["status"] == "DIPUTIHKAN"),
        "segera_diputihkan": len(nearing),
        "macet": len(macet_list),
        "bulan_ini": sum(1 for r in mine if (r.get("tanggal_booking") or "").startswith(now_month)),
        "target": target, "month": now_month,
        "nearing": nearing, "macet_list": macet_list,
    }

# ============== AI Asisten (Claude / ChatGPT / Image) ==============
AI_PROVIDERS = {
    "claude": ("anthropic", "claude-sonnet-5-5"),
    "chatgpt": ("openai", "gpt-5.6-terra"),
}

class AiChatIn(BaseModel):
    message: str
    provider: str = "claude"
    session_id: Optional[str] = None
    mode: str = "chat"  # chat | summary | catatan

class AiImageIn(BaseModel):
    prompt: str

async def _ai_data_context(project_id: str, marketing: Optional[str] = None) -> str:
    proj = await db.projects.find_one({"id": project_id}) or {}
    kpr_q: dict = {"project_id": project_id}
    if marketing:
        kpr_q["marketing"] = marketing
    kpr = await db.kpr.find(kpr_q, {"_id": 0}).to_list(2000)
    units = await db.units.find({"project_id": project_id}, {"_id": 0}).to_list(2000)
    legality = await db.legality_unit.find({"project_id": project_id}, {"_id": 0}).to_list(2000)
    for r in kpr:
        await compute_kpr_status(r)
    for u in units:
        await compute_unit_status(u)
    counts = {"PROSES": 0, "SP3K": 0, "DONE": 0, "DIPUTIHKAN": 0}
    for r in kpr:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    macet = [r for r in kpr if r.get("perlu_tindak_lanjut")]
    lines = [f"PROYEK: {proj.get('name','-')} ({proj.get('company_name','-')})",
             f"Total berkas KPR: {len(kpr)} | Proses: {counts['PROSES']} | SP3K: {counts['SP3K']} | Done(Akad): {counts['DONE']} | Diputihkan: {counts['DIPUTIHKAN']}",
             f"Total unit: {len(units)} | Rata-rata progres: {round(sum(u['persen_progres'] for u in units)/len(units),1) if units else 0}%",
             f"Berkas perlu tindak lanjut (>7 hari tanpa update): {len(macet)}",
             "", "DAFTAR BERKAS (nama | blok | marketing | bank | tahap | status | sisa hari pemutihan | perlu_tindak_lanjut):"]
    for r in kpr[:120]:
        lines.append(f"- {r.get('nama_konsumen','')} | {r.get('blok_kavling','')} | {r.get('marketing','')} | "
                     f"{r.get('bank_pemroses','')} | {r.get('tahap_saat_ini','')} | {r['status']} | "
                     f"{r.get('days_to_pemutihan')} | {'YA' if r.get('perlu_tindak_lanjut') else 'tidak'}")
    lines.append("")
    lines.append("LEGALITAS (blok | sertifikat | imb/pbg | pbb):")
    for l in legality[:120]:
        lines.append(f"- {l.get('blok_kavling','')} | {l.get('status_sertifikat') or '-'} | "
                     f"{l.get('status_imb_pbg') or '-'} | {l.get('status_pbb') or '-'}")
    return "\n".join(lines)

@api_router.post("/ai/chat")
async def ai_chat(body: AiChatIn, project_id: str = Depends(current_project), user=Depends(current_user)):
    if not EMERGENT_KEY:
        raise HTTPException(500, "AI belum dikonfigurasi (EMERGENT_LLM_KEY kosong)")
    if body.provider not in AI_PROVIDERS:
        raise HTTPException(400, "Provider harus 'claude' atau 'chatgpt'")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    session_id = body.session_id or str(uuid.uuid4())
    mk = user.get("marketing_name") if user["role"] == "marketing" else None
    ctx = await _ai_data_context(project_id, mk)
    base_sys = ("Anda adalah asisten AI untuk aplikasi monitoring KPR rumah subsidi 'LBT One' "
                "milik PT Lider Bahtera Toolsindo. Jawab SELALU dalam Bahasa Indonesia, ringkas, "
                "akurat, dan berbasis DATA yang diberikan. Jika data tidak ada, katakan tidak tahu.\n\n"
                "DATA SAAT INI:\n" + ctx)
    if body.mode == "summary":
        base_sys += ("\n\nTUGAS: Buat ringkasan eksekutif status proyek: progres keseluruhan, "
                     "komposisi status berkas, dan daftar berkas yang PERLU TINDAK LANJUT beserta saran aksi.")
    elif body.mode == "catatan":
        base_sys += ("\n\nTUGAS: Bantu tuliskan catatan/keterangan proses berkas yang singkat, "
                     "profesional, dan jelas (maksimal 2 kalimat) sesuai konteks yang diberikan user.")
    provider, model = AI_PROVIDERS[body.provider]
    chat = LlmChat(api_key=EMERGENT_KEY, session_id=session_id, system_message=base_sys).with_model(provider, model)
    # muat riwayat singkat agar multi-turn (hanya sesi milik user ini)
    prior = await db.ai_messages.find({"session_id": session_id, "username": user["username"]},
                                      {"_id": 0}).sort("waktu", 1).to_list(20)
    history_txt = ""
    for m in prior[-8:]:
        history_txt += f"\n{m['role'].upper()}: {m['content']}"
    user_text = (f"Riwayat percakapan sebelumnya:{history_txt}\n\nPertanyaan baru: {body.message}"
                 if history_txt else body.message)
    try:
        reply = await chat.send_message(UserMessage(text=user_text))
    except Exception as e:
        logger.exception("AI chat gagal")
        raise HTTPException(502, f"AI gagal merespons: {e}")
    now = datetime.now(timezone.utc).isoformat()
    await db.ai_messages.insert_many([
        {"id": str(uuid.uuid4()), "session_id": session_id, "project_id": project_id,
         "role": "user", "content": body.message, "username": user["username"], "waktu": now},
        {"id": str(uuid.uuid4()), "session_id": session_id, "project_id": project_id,
         "role": "assistant", "content": reply, "username": user["username"], "waktu": now},
    ])
    return {"session_id": session_id, "reply": reply, "provider": body.provider}

@api_router.get("/ai/history")
async def ai_history(session_id: str, user=Depends(current_user)):
    rows = await db.ai_messages.find({"session_id": session_id, "username": user["username"]},
                                     {"_id": 0}).sort("waktu", 1).to_list(200)
    return rows

@api_router.post("/ai/image")
async def ai_image(body: AiImageIn, user=Depends(current_user)):
    if not EMERGENT_KEY:
        raise HTTPException(500, "AI belum dikonfigurasi (EMERGENT_LLM_KEY kosong)")
    if not body.prompt.strip():
        raise HTTPException(400, "Prompt tidak boleh kosong")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=EMERGENT_KEY, session_id=str(uuid.uuid4()),
                   system_message="You generate high quality images.").with_model(
                   "gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    try:
        text, images = await chat.send_message_multimodal_response(UserMessage(text=body.prompt))
    except Exception as e:
        logger.exception("AI image gagal")
        raise HTTPException(502, f"Gagal membuat gambar: {e}")
    if not images:
        raise HTTPException(502, "Model tidak mengembalikan gambar")
    img = images[0]
    data = base64.b64decode(img["data"])
    path = f"{APP_NAME}/ai/{user['username']}/{uuid.uuid4()}.png"
    await run_in_threadpool(_put_object_sync, path, data, img.get("mime_type", "image/png"))
    return {"path": path, "text": text or ""}

# ============== Health ==============
@api_router.get("/")
async def root():
    return {"message": "Mahkota Graha KPR API"}


app.include_router(api_router)
