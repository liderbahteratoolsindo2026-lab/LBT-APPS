"""Smoke test cepat fitur baru (run: python tests/smoke_new_features.py)"""
import os, sys, json, requests

BASE = os.environ.get("BASE", "http://localhost:8001")


def login(u, p):
    r = requests.post(f"{BASE}/api/auth/login", json={"username": u, "password": p})
    r.raise_for_status()
    return r.json()


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    admin = login("admin", "Admin@123")
    A = hdr(admin["access_token"])

    # marketing user
    requests.delete(f"{BASE}/api/users/rina_mkt", headers=A)
    r = requests.post(f"{BASE}/api/users", headers=A, json={
        "username": "rina_mkt", "password": "Rina@123", "name": "Rina Marketing",
        "role": "marketing", "marketing_name": "Rina"})
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/api/users", headers=A, json={
        "username": "x_mkt", "password": "x", "name": "X", "role": "marketing"})
    assert r.status_code == 400, "marketing tanpa nama harus gagal"

    rina = login("rina_mkt", "Rina@123")
    assert rina["user"]["marketing_name"] == "Rina"
    R = hdr(rina["access_token"])

    # units available
    units = requests.get(f"{BASE}/api/units/available", headers=A).json()
    assert len(units) >= 2, "butuh >=2 unit tersedia"
    b1, b2 = units[0]["blok_kavling"], units[1]["blok_kavling"]

    # Rina creates own file -> OK
    r = requests.post(f"{BASE}/api/kpr", headers=R, json={
        "nama_konsumen": "Konsumen Rina", "blok_kavling": b1, "marketing": "Rina",
        "bank_pemroses": "BTN", "tanggal_booking": "2026-06-01", "tahap_saat_ini": "Pemberkasan"})
    assert r.status_code == 200, r.text
    k1 = r.json()
    # Rina creates for Budi -> 403
    r = requests.post(f"{BASE}/api/kpr", headers=R, json={
        "nama_konsumen": "Konsumen Budi", "blok_kavling": b2, "marketing": "Budi",
        "bank_pemroses": "BTN", "tanggal_booking": "2026-06-01", "tahap_saat_ini": "Pemberkasan"})
    assert r.status_code == 403, r.text
    # Admin creates for Budi
    r = requests.post(f"{BASE}/api/kpr", headers=A, json={
        "nama_konsumen": "Konsumen Budi", "blok_kavling": b2, "marketing": "Budi",
        "bank_pemroses": "BRI", "tanggal_booking": "2026-06-02", "tahap_saat_ini": "Entry"})
    assert r.status_code == 200, r.text
    k2 = r.json()
    # Rina edits Budi's -> 403
    r = requests.put(f"{BASE}/api/kpr/{k2['id']}", headers=R, json={**{k: v for k, v in k2.items() if k in (
        "nama_konsumen", "blok_kavling", "marketing", "bank_pemroses", "tanggal_booking", "tahap_saat_ini")}, "tahap_saat_ini": "Dvo"})
    assert r.status_code == 403, r.text
    # Rina edits own -> OK, history
    r = requests.put(f"{BASE}/api/kpr/{k1['id']}", headers=R, json={
        "nama_konsumen": "Konsumen Rina", "blok_kavling": b1, "marketing": "Rina",
        "bank_pemroses": "BTN", "tanggal_booking": "2026-06-01", "tahap_saat_ini": "Entry"})
    assert r.status_code == 200, r.text
    hist = requests.get(f"{BASE}/api/kpr/{k1['id']}/history", headers=R).json()
    assert len(hist) == 2 and hist[0]["aksi"] == "DIUBAH" and hist[0]["perubahan"][0]["ke"] == "Entry", hist
    # Rina can read all
    allk = requests.get(f"{BASE}/api/kpr", headers=R).json()
    assert any(k["marketing"] == "Budi" for k in allk)

    # dashboard filter
    d = requests.get(f"{BASE}/api/dashboard", headers=R, params={"month": "2026-06", "marketing": "Rina"}).json()
    assert d["kpi"]["total"] >= 1 and all(m["marketing"] == "Rina" for m in d["by_marketing"])
    assert "kpr_rows" not in d

    # reports
    for fmt in ("xlsx", "pdf"):
        r = requests.get(f"{BASE}/api/reports/monthly", headers=R, params={"month": "2026-06", "format": fmt})
        assert r.status_code == 200 and len(r.content) > 1000, fmt
        assert "attachment" in r.headers.get("content-disposition", "")

    # photos & legal docs list
    assert requests.get(f"{BASE}/api/units/{b1}/photos", headers=R).status_code == 200
    assert requests.get(f"{BASE}/api/legality/docs", headers=R, params={"scope": "unit", "blok": b1}).status_code == 200
    # legal doc upload by marketing -> 403
    r = requests.post(f"{BASE}/api/legality/docs", headers=R, files={"file": ("a.pdf", b"%PDF-1.4 test", "application/pdf")},
                      data={"scope": "unit", "blok_kavling": b1, "jenis": "Sertifikat"})
    assert r.status_code == 403
    # by admin -> 200 (needs storage)
    r = requests.post(f"{BASE}/api/legality/docs", headers=A, files={"file": ("a.pdf", b"%PDF-1.4 test", "application/pdf")},
                      data={"scope": "unit", "blok_kavling": b1, "jenis": "Sertifikat", "catatan": "scan"})
    assert r.status_code == 200, r.text
    doc = r.json()
    docs = requests.get(f"{BASE}/api/legality/docs", headers=R, params={"scope": "unit", "blok": b1}).json()
    assert any(x["id"] == doc["id"] for x in docs)
    r = requests.get(f"{BASE}/api/files/{doc['path']}", headers=R, params={"download": "a.pdf"})
    assert r.status_code == 200 and r.content.startswith(b"%PDF"), r.status_code
    assert "attachment" in r.headers.get("content-disposition", "")
    assert requests.delete(f"{BASE}/api/legality/docs/{doc['id']}", headers=A).status_code == 200

    # doc types seeded
    t = requests.get(f"{BASE}/api/settings/lists/legality_doc_types", headers=R).json()
    assert len(t["items"]) >= 5

    # cleanup
    requests.delete(f"{BASE}/api/kpr/{k1['id']}", headers=R)
    requests.delete(f"{BASE}/api/kpr/{k2['id']}", headers=A)
    print("ALL SMOKE TESTS PASSED")


if __name__ == "__main__":
    main()
