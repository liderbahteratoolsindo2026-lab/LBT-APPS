"""Iteration 3 backend tests: password change/reset, cabang_pemroses, SP3K/Akad auto date, marketing stage restrictions.

Run: pytest /app/backend/tests/test_iteration3.py -v
"""
import os
import requests
import pytest
from datetime import date

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "https://bangun-pantau-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(u, p):
    return requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30)


@pytest.fixture(scope="module")
def admin_tok():
    r = _login("admin", "Admin@123")
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h(admin_tok):
    return {"Authorization": f"Bearer {admin_tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def kpr1_tok(admin_h):
    # make sure kpr1 exists at Kpr@123
    requests.delete(f"{API}/users/kpr1", headers=admin_h, timeout=30)
    r = requests.post(f"{API}/users", headers=admin_h, json={
        "username": "kpr1", "password": "Kpr@123", "name": "Admin KPR 1", "role": "admin_kpr"
    }, timeout=30)
    assert r.status_code == 200, r.text
    lr = _login("kpr1", "Kpr@123")
    assert lr.status_code == 200, lr.text
    return lr.json()["access_token"]


@pytest.fixture(scope="module")
def rina_tok():
    r = _login("rina_mkt", "Rina@123")
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# -------- Change own password (/api/auth/password) --------
class TestChangeOwnPassword:
    def test_wrong_current_returns_400(self, admin_h):
        r = requests.post(f"{API}/auth/password", headers=admin_h,
                          json={"current_password": "WRONG", "new_password": "NewPass@123"}, timeout=30)
        assert r.status_code == 400, r.text

    def test_same_password_returns_400(self, admin_h):
        r = requests.post(f"{API}/auth/password", headers=admin_h,
                          json={"current_password": "Admin@123", "new_password": "Admin@123"}, timeout=30)
        assert r.status_code == 400
        assert "berbeda" in r.text.lower()

    def test_short_password_returns_422(self, admin_h):
        r = requests.post(f"{API}/auth/password", headers=admin_h,
                          json={"current_password": "Admin@123", "new_password": "ab12"}, timeout=30)
        assert r.status_code == 422

    def test_success_then_restore(self, admin_h):
        # change admin password to Admin@1234
        r = requests.post(f"{API}/auth/password", headers=admin_h,
                          json={"current_password": "Admin@123", "new_password": "Admin@1234"}, timeout=30)
        assert r.status_code == 200, r.text
        # old password should fail
        assert _login("admin", "Admin@123").status_code == 401
        # new password works
        new_tok = _login("admin", "Admin@1234").json()["access_token"]
        new_h = {"Authorization": f"Bearer {new_tok}", "Content-Type": "application/json"}
        # restore back to Admin@123
        rr = requests.post(f"{API}/auth/password", headers=new_h,
                           json={"current_password": "Admin@1234", "new_password": "Admin@123"}, timeout=30)
        assert rr.status_code == 200
        assert _login("admin", "Admin@123").status_code == 200


# -------- Admin reset user password (/api/users/{username}/password) --------
class TestAdminResetPassword:
    def test_non_admin_forbidden(self, kpr1_tok):
        h = {"Authorization": f"Bearer {kpr1_tok}", "Content-Type": "application/json"}
        r = requests.post(f"{API}/users/rina_mkt/password", headers=h,
                          json={"new_password": "Hack@1234"}, timeout=30)
        assert r.status_code == 403

    def test_marketing_forbidden(self, rina_tok):
        h = {"Authorization": f"Bearer {rina_tok}", "Content-Type": "application/json"}
        r = requests.post(f"{API}/users/admin/password", headers=h,
                          json={"new_password": "Hack@1234"}, timeout=30)
        assert r.status_code == 403

    def test_user_not_found_returns_404(self, admin_h):
        r = requests.post(f"{API}/users/nonexistent_user_xyz/password", headers=admin_h,
                          json={"new_password": "Any@1234"}, timeout=30)
        assert r.status_code == 404

    def test_admin_reset_kpr1_then_restore(self, admin_h):
        # Reset kpr1 → Kpr@1234
        r = requests.post(f"{API}/users/kpr1/password", headers=admin_h,
                          json={"new_password": "Kpr@1234"}, timeout=30)
        assert r.status_code == 200
        assert _login("kpr1", "Kpr@123").status_code == 401
        assert _login("kpr1", "Kpr@1234").status_code == 200
        # Restore back to Kpr@123
        r2 = requests.post(f"{API}/users/kpr1/password", headers=admin_h,
                           json={"new_password": "Kpr@123"}, timeout=30)
        assert r2.status_code == 200
        assert _login("kpr1", "Kpr@123").status_code == 200


# -------- Branches list --------
class TestBranchesList:
    def test_branches_contains_defaults(self, admin_h):
        r = requests.get(f"{API}/settings/lists/branches", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        items = [i["name"] for i in r.json().get("items", [])]
        for want in ("Subang", "Bekasi", "Purwakarta"):
            assert want in items, f"{want} missing. Got {items}"


# -------- KPR cabang_pemroses + stage auto date + marketing restrictions --------
class TestKprStageRules:
    kpr_id = None
    blok = None

    def test_create_kpr_with_cabang(self, admin_h):
        units = requests.get(f"{API}/units/available", headers=admin_h, timeout=30).json()
        assert units, "butuh unit available"
        TestKprStageRules.blok = units[0]["blok_kavling"]
        r = requests.post(f"{API}/kpr", headers=admin_h, json={
            "nama_konsumen": "TEST Iter3",
            "blok_kavling": TestKprStageRules.blok,
            "marketing": "Rina",
            "bank_pemroses": "BTN",
            "cabang_pemroses": "Subang",
            "tanggal_booking": "2026-09-01",
            "tahap_saat_ini": "Pemberkasan",
        }, timeout=30)
        assert r.status_code == 200, r.text
        rec = r.json()
        TestKprStageRules.kpr_id = rec["id"]
        assert rec["cabang_pemroses"] == "Subang"

    def test_marketing_cannot_set_sp3k(self, rina_tok):
        assert TestKprStageRules.kpr_id
        h = {"Authorization": f"Bearer {rina_tok}", "Content-Type": "application/json"}
        r = requests.put(f"{API}/kpr/{TestKprStageRules.kpr_id}", headers=h, json={
            "nama_konsumen": "TEST Iter3",
            "blok_kavling": TestKprStageRules.blok,
            "marketing": "Rina",
            "bank_pemroses": "BTN",
            "cabang_pemroses": "Subang",
            "tanggal_booking": "2026-09-01",
            "tahap_saat_ini": "Sp3k",
        }, timeout=30)
        assert r.status_code == 403, r.text

    def test_admin_kpr_set_sp3k_auto_date(self, kpr1_tok):
        h = {"Authorization": f"Bearer {kpr1_tok}", "Content-Type": "application/json"}
        r = requests.put(f"{API}/kpr/{TestKprStageRules.kpr_id}", headers=h, json={
            "nama_konsumen": "TEST Iter3",
            "blok_kavling": TestKprStageRules.blok,
            "marketing": "Rina",
            "bank_pemroses": "BTN",
            "cabang_pemroses": "Subang",
            "tanggal_booking": "2026-09-01",
            "tahap_saat_ini": "Sp3k",
        }, timeout=30)
        assert r.status_code == 200, r.text
        # PUT returns {"ok": True}; verify via GET list
        rows = requests.get(f"{API}/kpr", headers=h, timeout=30).json()
        row = next(x for x in rows if x["id"] == TestKprStageRules.kpr_id)
        assert row.get("tanggal_sp3k") == date.today().isoformat(), row
        assert row["tahap_saat_ini"].lower() == "sp3k"

    def test_history_has_tgl_sp3k(self, kpr1_tok):
        h = {"Authorization": f"Bearer {kpr1_tok}"}
        hist = requests.get(f"{API}/kpr/{TestKprStageRules.kpr_id}/history", headers=h, timeout=30).json()
        all_fields = []
        for ev in hist:
            for p in ev.get("perubahan", []) or []:
                all_fields.append(p.get("field"))
        assert "Tgl SP3K" in all_fields, all_fields

    def test_admin_kpr_set_akad_auto_date(self, kpr1_tok):
        h = {"Authorization": f"Bearer {kpr1_tok}", "Content-Type": "application/json"}
        r = requests.put(f"{API}/kpr/{TestKprStageRules.kpr_id}", headers=h, json={
            "nama_konsumen": "TEST Iter3",
            "blok_kavling": TestKprStageRules.blok,
            "marketing": "Rina",
            "bank_pemroses": "BTN",
            "cabang_pemroses": "Subang",
            "tanggal_booking": "2026-09-01",
            "tahap_saat_ini": "Akad",
        }, timeout=30)
        assert r.status_code == 200, r.text
        rows = requests.get(f"{API}/kpr", headers=h, timeout=30).json()
        row = next(x for x in rows if x["id"] == TestKprStageRules.kpr_id)
        assert row.get("tanggal_akad") == date.today().isoformat(), row
        hist = requests.get(f"{API}/kpr/{TestKprStageRules.kpr_id}/history", headers={"Authorization": f"Bearer {kpr1_tok}"}, timeout=30).json()
        fields = [p.get("field") for ev in hist for p in (ev.get("perubahan") or [])]
        assert "Tgl Akad" in fields, fields

    def test_cleanup(self, admin_h):
        if TestKprStageRules.kpr_id:
            r = requests.delete(f"{API}/kpr/{TestKprStageRules.kpr_id}", headers=admin_h, timeout=30)
            assert r.status_code == 200
