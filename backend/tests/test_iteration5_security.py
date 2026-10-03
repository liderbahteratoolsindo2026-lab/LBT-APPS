"""Iteration 5 security verification tests.

Verifies security fixes:
- SEC-001: marketing scope on list_kpr / dashboard / combined-table / kpr history
- SEC-002: Apple login never trusts client-provided email
- SEC-005: AI history IDOR fixed (filtered by username)
- SEC-003: must_change_password field present in login response
- Regression: core flows (dashboard, projects, AI, RBAC) still work.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bangun-pantau-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token['access_token']}"}


@pytest.fixture(scope="session")
def mkt_token():
    r = requests.post(f"{API}/auth/login", json={"username": "mkt_adit", "password": "Mkt@123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def mkt_h(mkt_token):
    return {"Authorization": f"Bearer {mkt_token['access_token']}"}


# =========== SEC-003: must_change_password field in login response ===========
class TestSEC003LoginFlag:
    def test_admin_login_contains_must_change_password_field(self, admin_token):
        assert "must_change_password" in admin_token["user"]
        # Admin dev-DB OK to be False (dev convenience)
        assert admin_token["user"]["must_change_password"] in (True, False)

    def test_mkt_login_contains_must_change_password_field(self, mkt_token):
        assert "must_change_password" in mkt_token["user"]

    def test_change_own_password_for_non_admin_works(self, admin_h):
        """Create temp user, login, call /auth/password to change pwd."""
        uname = "TEST_pwd_user"
        # cleanup first (best-effort)
        requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)
        payload = {"username": uname, "name": "Test Pwd", "role": "admin_bangunan", "password": "Init@123"}
        r = requests.post(f"{API}/users", json=payload, headers=admin_h, timeout=30)
        assert r.status_code in (200, 201), r.text
        try:
            # login as new user
            l = requests.post(f"{API}/auth/login", json={"username": uname, "password": "Init@123"}, timeout=30)
            assert l.status_code == 200, l.text
            tok = l.json()["access_token"]
            # change own password
            cp = requests.post(f"{API}/auth/password",
                               headers={"Authorization": f"Bearer {tok}"},
                               json={"current_password": "Init@123", "new_password": "Baru@456"},
                               timeout=30)
            assert cp.status_code == 200, cp.text
            # verify can login with new password
            l2 = requests.post(f"{API}/auth/login", json={"username": uname, "password": "Baru@456"}, timeout=30)
            assert l2.status_code == 200
        finally:
            requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)


# =========== SEC-001: Marketing scope on READ endpoints ===========
class TestSEC001MarketingScope:
    def test_admin_sees_all_25_kpr(self, admin_h):
        r = requests.get(f"{API}/kpr", headers=admin_h, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 25, f"admin expected 25, got {len(rows)}"
        mks = {row.get("marketing") for row in rows}
        assert mks == {"HAWIG", "ADIT", "WIDA", "SRI"}

    def test_marketing_sees_only_own_kpr(self, mkt_h):
        r = requests.get(f"{API}/kpr", headers=mkt_h, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 10, f"mkt_adit expected 10 rows, got {len(rows)}"
        for row in rows:
            assert row.get("marketing") == "ADIT", f"Leaked marketing: {row.get('marketing')}"

    def test_marketing_dashboard_scoped(self, mkt_h):
        r = requests.get(f"{API}/dashboard", headers=mkt_h, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # kpi total hanya ADIT (10)
        assert data["kpi"]["total"] == 10, f"Expected kpi.total=10 for ADIT, got {data['kpi']['total']}"
        # by_marketing only ADIT
        bm = data.get("by_marketing", [])
        marketings = {g["marketing"] for g in bm}
        assert marketings <= {"ADIT"}, f"Dashboard leaked other marketings: {marketings}"

    def test_combined_table_scoped(self, mkt_h):
        r = requests.get(f"{API}/dashboard/combined-table", headers=mkt_h, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        # Every row with nama_konsumen/marketing must belong to ADIT; others null
        for row in rows:
            m = row.get("marketing")
            nk = row.get("nama_konsumen")
            if m is not None:
                assert m == "ADIT", f"Combined-table leaked marketing {m}"
            if nk is not None:
                # nama_konsumen must belong to ADIT only (so marketing must be ADIT)
                assert m == "ADIT", f"Combined-table leaked nama_konsumen for non-ADIT: {row}"

    def test_marketing_cannot_see_other_kpr_history(self, admin_h, mkt_h):
        # pick a KPR owned by non-ADIT
        r = requests.get(f"{API}/kpr", headers=admin_h, timeout=30)
        other = next(row for row in r.json() if row.get("marketing") != "ADIT")
        hist = requests.get(f"{API}/kpr/{other['id']}/history", headers=mkt_h, timeout=30)
        assert hist.status_code == 403, f"Expected 403 for other marketing history, got {hist.status_code}"

    def test_marketing_can_see_own_kpr_history(self, admin_h, mkt_h):
        r = requests.get(f"{API}/kpr", headers=admin_h, timeout=30)
        own = next(row for row in r.json() if row.get("marketing") == "ADIT")
        hist = requests.get(f"{API}/kpr/{own['id']}/history", headers=mkt_h, timeout=30)
        assert hist.status_code == 200, hist.text

    def test_marketing_cannot_create_kpr_under_other_marketing(self, mkt_h):
        payload = {
            "nama_konsumen": "TEST_mkt_crossScope",
            "blok_kavling": "ZZ-ZZ",
            "tahap_saat_ini": "Pemberkasan",
            "bank_pemroses": "BTN",
            "marketing": "HAWIG",  # not ADIT
            "tanggal_booking": "2026-01-15",
        }
        r = requests.post(f"{API}/kpr", json=payload, headers=mkt_h, timeout=30)
        assert r.status_code in (400, 403), f"Expected 400/403, got {r.status_code}: {r.text}"


# =========== SEC-002: Apple login no email trust ===========
class TestSEC002AppleLogin:
    def test_apple_bogus_token_with_admin_email_rejected(self):
        r = requests.post(f"{API}/auth/apple",
                          json={"identity_token": "bogus", "email": "admin@x.com", "name": "x"},
                          timeout=30)
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}: {r.text}"

    def test_apple_empty_token_rejected(self):
        r = requests.post(f"{API}/auth/apple", json={"identity_token": "", "email": "a@b.c"}, timeout=30)
        assert r.status_code in (401, 403, 422), f"Expected 401/403/422, got {r.status_code}"

    def test_apple_malformed_jwt_rejected(self):
        r = requests.post(f"{API}/auth/apple",
                          json={"identity_token": "a.b.c", "email": "admin@x.com"},
                          timeout=30)
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


# =========== SEC-005: AI history IDOR fix ===========
class TestSEC005AiHistoryIdor:
    def test_mkt_cannot_read_admin_ai_history(self, admin_h, mkt_h):
        # admin creates a session
        chat_payload = {"message": "Berapa total berkas KPR saat ini?", "provider": "claude"}
        cr = requests.post(f"{API}/ai/chat", json=chat_payload, headers=admin_h, timeout=120)
        assert cr.status_code == 200, cr.text
        sid = cr.json()["session_id"]
        # admin can read own history
        own = requests.get(f"{API}/ai/history", params={"session_id": sid}, headers=admin_h, timeout=30)
        assert own.status_code == 200
        own_rows = own.json()
        assert len(own_rows) >= 2, "Admin should see own user+assistant messages"
        # mkt_adit tries to peek admin's session
        other = requests.get(f"{API}/ai/history", params={"session_id": sid}, headers=mkt_h, timeout=30)
        assert other.status_code == 200
        assert other.json() == [], f"IDOR: mkt_adit sees admin's AI history: {other.json()}"


# =========== Regression: core flows still work ===========
class TestRegression:
    def test_projects_list(self, admin_h):
        r = requests.get(f"{API}/projects", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_dashboard_marketing_adit_total_10(self, admin_h):
        r = requests.get(f"{API}/dashboard/marketing", params={"marketing": "ADIT"},
                         headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert r.json()["total"] == 10

    def test_ai_chat_claude(self, admin_h):
        r = requests.post(f"{API}/ai/chat",
                          json={"message": "Sebutkan total berkas secara singkat.", "provider": "claude"},
                          headers=admin_h, timeout=120)
        assert r.status_code == 200, r.text
        assert r.json().get("reply")

    def test_ai_chat_chatgpt(self, admin_h):
        r = requests.post(f"{API}/ai/chat",
                          json={"message": "Sebutkan total berkas secara singkat.", "provider": "chatgpt"},
                          headers=admin_h, timeout=120)
        assert r.status_code == 200, r.text
        assert r.json().get("reply")

    def test_marketing_cannot_create_user(self, mkt_h):
        r = requests.post(f"{API}/users",
                          json={"username": "TEST_x", "name": "x", "role": "admin_kpr", "password": "Abc@1234"},
                          headers=mkt_h, timeout=30)
        assert r.status_code == 403

    def test_marketing_cannot_create_project(self, mkt_h):
        r = requests.post(f"{API}/projects",
                          json={"name": "TEST_proj_mkt"},
                          headers=mkt_h, timeout=30)
        assert r.status_code == 403
