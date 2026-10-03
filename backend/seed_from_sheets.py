"""
Import data existing dari 4 Google Sheets (Mahkota Graha I) ke MongoDB.
Jalankan: python seed_from_sheets.py
Sheets dishare "Anyone with the link" -> diunduh sebagai CSV (/export?format=csv).
"""
import csv
import io
import os
import uuid
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

SHEETS = {
    "kpr": "1y5VU4XjFPeiuH72jGo-lC4ofcSUGnQwX_-Tq0SUdCKI",
    "bangunan": "1XRn032jbUPV6b8-KYfcbekg2tZfXqephTRkvG8VIr38",
    "legal": "1LkaliA406Tf_YBjWwzWwokTW75jWvHYhJH9GVceSoAE",
}

CONSTRUCTION_STAGES = {  # nama kanonik -> persen (harus match settings di server.py)
    "rencana bangun": 0, "pondasi": 10, "sloof": 20, "dinding": 30,
    "kuda-kuda/atap": 40, "plafon": 55, "lantai": 65, "pengecatan": 75,
    "instalasi listrik/air": 85, "finishing": 95, "serah terima": 100,
}
STAGE_CANON = {
    "rencana bangun": "Rencana Bangun", "pondasi": "Pondasi", "sloof": "Sloof",
    "dinding": "Dinding", "kuda-kuda/atap": "Kuda-kuda/Atap", "plafon": "Plafon",
    "lantai": "Lantai", "pengecatan": "Pengecatan",
    "instalasi listrik/air": "Instalasi Listrik/Air", "finishing": "Finishing",
    "serah terima": "Serah Terima",
}
KPR_STAGE_CANON = {s.lower(): s for s in
                   ["Pemberkasan", "Entry", "Dvo", "Ots", "Analis", "Approval",
                    "Banding", "Reject", "Sp3k", "Akad"]}

REAL_MARKETING = ["HAWIG", "ADIT", "WIDA", "SRI"]
REAL_BANKS = ["BTN KC Bekasi", "BTN KC Purwakarta", "BTN KC Cikarang", "BTN KC Harapan Indah",
              "Mandiri", "BNI", "BRI", "BSN", "BSI", "BCA", "Artagraha", "BPRS"]


def fetch_csv(sheet_id):
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return list(csv.reader(io.StringIO(r.text)))


def norm_stage(raw):
    key = (raw or "").strip().lower()
    return STAGE_CANON.get(key, raw.strip().title() if raw else "Rencana Bangun")


def parse_date(s):
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%d/%m/%y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def main():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    now = datetime.now(timezone.utc).isoformat()

    # Proyek default
    proj = db.projects.find_one({}, sort=[("order", 1)])
    if not proj:
        pid = str(uuid.uuid4())
        db.projects.insert_one({"id": pid, "name": "Mahkota Graha I",
                                "company_name": "PT Lider Bahtera Toolsindo", "alamat": "Subang",
                                "order": 0, "active": True, "created_at": now})
    else:
        pid = proj["id"]
        db.projects.update_one({"id": pid}, {"$set": {"name": "Mahkota Graha I"}})
    print(f"Project: Mahkota Graha I ({pid})")

    # Update daftar marketing & bank ke data asli
    for key, names in (("marketing", REAL_MARKETING), ("banks", REAL_BANKS)):
        items = [{"id": str(uuid.uuid4()), "name": n, "order": i} for i, n in enumerate(names)]
        db.settings_lists.update_one({"key": key}, {"$set": {"items": items}}, upsert=True)

    # Hapus data lama proyek ini (replace data contoh)
    for coll in ("units", "kpr", "legality_unit", "legality_project", "unit_photos", "kpr_history"):
        db[coll].delete_many({"project_id": pid})
    # Data contoh lama tanpa project_id
    for coll in ("units", "kpr", "legality_unit"):
        db[coll].delete_many({"project_id": {"$exists": False}})

    # --- UNITS (bangunan) ---
    rows = fetch_csv(SHEETS["bangunan"])
    units_bloks = set()
    n_units = 0
    for r in rows:
        if len(r) < 11 or not r[1].strip().isdigit():
            continue
        blok = r[2].strip()
        if not blok:
            continue
        stage = norm_stage(r[5])
        db.units.insert_one({
            "blok_kavling": blok, "project_id": pid,
            "nama_kontraktor": r[4].strip(),
            "tahap_konstruksi": stage,
            "tanggal_mulai": parse_date(r[7]),
            "tanggal_target_selesai": parse_date(r[8]),
            "tanggal_realisasi_selesai": parse_date(r[9]),
            "kendala_catatan": (r[12].strip() if len(r) > 12 else ""),
            "link_foto_dokumentasi": (r[13].strip() if len(r) > 13 else ""),
            "foto_path": None, "updated_at": now,
        })
        units_bloks.add(blok)
        n_units += 1
    print(f"Units: {n_units}")

    # --- KPR (daftar berkas) ---
    rows = fetch_csv(SHEETS["kpr"])
    started = False
    n_kpr = 0
    for r in rows:
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
        marketing = (r[4] or "").strip()
        keterangan = (r[7] or "").strip()
        sp3k_date = parse_date(r[10]) if len(r) > 10 else None
        tahap_raw = (r[12] or "").strip() if len(r) > 12 else ""
        tahap = KPR_STAGE_CANON.get(tahap_raw.lower(), tahap_raw.title() or "Pemberkasan")
        rec = {
            "id": str(uuid.uuid4()), "project_id": pid,
            "nama_konsumen": nama, "blok_kavling": blok,
            "marketing": marketing, "bank_pemroses": "", "cabang_pemroses": "",
            "tanggal_booking": "", "tahap_saat_ini": tahap,
            "tanggal_sp3k": sp3k_date,
            "tanggal_akad": None, "keterangan": keterangan, "keterangan_tahap": "",
            "tanggal_update_terakhir": now, "created_by": "import",
        }
        if tahap.lower() == "akad":
            rec["tanggal_akad"] = sp3k_date or now[:10]
        if status_label == "DIPUTIHKAN":
            rec["diputihkan_manual"] = True
            rec["tanggal_pemutihan"] = now
            rec["alasan_pemutihan"] = keterangan or "Diputihkan (import data existing)"
            rec["diputihkan_oleh"] = "import"
        db.kpr.insert_one(rec)
        n_kpr += 1
    print(f"KPR: {n_kpr}")

    # --- LEGALITAS per unit ---
    rows = fetch_csv(SHEETS["legal"])
    n_legal = 0
    for r in rows:
        if len(r) < 13 or not r[1].strip().isdigit():
            continue
        blok = (r[2] or "").strip()
        if not blok:
            continue
        db.legality_unit.update_one(
            {"blok_kavling": blok, "project_id": pid},
            {"$set": {
                "blok_kavling": blok, "project_id": pid,
                "status_sertifikat": (r[4] or "").strip(),
                "nomor_sertifikat": (r[5] or "").strip(),
                "status_imb_pbg": (r[6] or "").strip(),
                "nomor_imb_pbg": (r[7] or "").strip(),
                "status_pbb": (r[8] or "").strip(),
                "nop": (r[9] or "").strip(),
                "status_ssp_pph": (r[10] or "").strip(),
                "status_bphtb": (r[11] or "").strip(),
                "keterangan": (r[12] or "").strip(),
                "updated_at": now,
            }}, upsert=True)
        n_legal += 1
    print(f"Legalitas: {n_legal}")
    print("Import selesai.")
    client.close()


if __name__ == "__main__":
    main()
