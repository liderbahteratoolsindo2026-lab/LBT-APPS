"""Iteration 6 tests:
A) Add unit (admin_utama/admin_bangunan)
B) Add legality explicit (admin_utama/admin_legal, blok may be outside unit list)
C) /api/admin/sync-sheets (idempotent, admin only)
D) Password policy on create/change/reset
E) Login lockout 5 failures / 15 minutes
Plus regression: 25 KPR, dashboard KPI, marketing scope, AI claude reply.
"""
import os
import time
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "https://bangun-pantau-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(username, password):
    return requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=30)


@pytest.fixture(scope="session")
def admin_token():
    r = _login("admin", "Admin@123")
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ============== D) PASSWORD POLICY ==============
class TestPasswordPolicy:
    def _mkuser_body(self, pw, suffix):
        return {"username": f"TEST_pw_{suffix}", "password": pw, "name": "Pw Tester", "role": "admin_kpr"}

    def test_create_user_too_short(self, admin_h):
        r = requests.post(f"{API}/users", json=self._mkuser_body("abc", "short"), headers=admin_h, timeout=30)
        assert r.status_code == 400, r.text
        assert "minimal 8" in r.text.lower() or "8 karakter" in r.text.lower()

    def test_create_user_letters_only(self, admin_h):
        r = requests.post(f"{API}/users", json=self._mkuser_body("abcdefgh", "lettersonly"), headers=admin_h, timeout=30)
        assert r.status_code == 400
        assert "angka" in r.text.lower()

    def test_create_user_digits_only(self, admin_h):
        r = requests.post(f"{API}/users", json=self._mkuser_body("12345678", "digitsonly"), headers=admin_h, timeout=30)
        assert r.status_code == 400
        assert "huruf" in r.text.lower()

    def test_create_user_valid_password(self, admin_h):
        # cleanup first
        requests.delete(f"{API}/users/TEST_pw_valid", headers=admin_h, timeout=30)
        r = requests.post(f"{API}/users", json=self._mkuser_body("Pass1234", "valid"), headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        # verify created via login
        lr = _login("TEST_pw_valid", "Pass1234")
        assert lr.status_code == 200
        # cleanup
        requests.delete(f"{API}/users/TEST_pw_valid", headers=admin_h, timeout=30)

    def test_admin_reset_password_too_short(self, admin_h):
        # make sure target user exists
        requests.delete(f"{API}/users/TEST_pw_reset", headers=admin_h, timeout=30)
        requests.post(f"{API}/users", json={"username": "TEST_pw_reset", "password": "Pass1234",
                                            "name": "pwreset", "role": "admin_kpr"},
                      headers=admin_h, timeout=30)
        # Use 6-char length (passes pydantic min_length=6) so our custom validate_password fires -> 400
        r = requests.post(f"{API}/users/TEST_pw_reset/password",
                          json={"new_password": "abcdef"}, headers=admin_h, timeout=30)
        # Any 4xx rejection counts (user story: 'ditolak'). Prefer 400 from policy.
        assert r.status_code in (400, 422), r.text

    def test_admin_reset_password_valid(self, admin_h):
        r = requests.post(f"{API}/users/TEST_pw_reset/password",
                          json={"new_password": "NewPass123"}, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        # confirm login with new pw
        lr = _login("TEST_pw_reset", "NewPass123")
        assert lr.status_code == 200
        requests.delete(f"{API}/users/TEST_pw_reset", headers=admin_h, timeout=30)


# ============== E) LOCKOUT (NEVER on admin) ==============
class TestLockout:
    USERNAME = "TEST_locku"
    PASSWORD = "Pass1234"

    @pytest.fixture(scope="class", autouse=True)
    def setup_user(self, admin_h):
        requests.delete(f"{API}/users/{self.USERNAME}", headers=admin_h, timeout=30)
        r = requests.post(f"{API}/users",
                          json={"username": self.USERNAME, "password": self.PASSWORD,
                                "name": "Locku", "role": "admin_kpr"},
                          headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        yield
        requests.delete(f"{API}/users/{self.USERNAME}", headers=admin_h, timeout=30)

    def test_lockout_flow(self, admin_h):
        # 5 wrong logins -> all 401
        sisa_seen = False
        for i in range(5):
            r = _login(self.USERNAME, "wrongpass")
            assert r.status_code == 401, f"attempt {i+1}: {r.status_code} {r.text}"
            if "sisa" in r.text.lower() or "percobaan" in r.text.lower():
                sisa_seen = True
        # Server shows 'sisa percobaan' message at least on attempts where remaining = 1 or 2
        assert sisa_seen, "Expected 'sisa percobaan' hint before lockout on at least one attempt"

        # 6th attempt WITH CORRECT PASSWORD must be 429 (locked)
        r = _login(self.USERNAME, self.PASSWORD)
        assert r.status_code == 429, f"expected 429 after lockout, got {r.status_code}: {r.text}"
        assert "terkunci" in r.text.lower() or "menit" in r.text.lower()

        # Admin reset password -> clears lockout
        r = requests.post(f"{API}/users/{self.USERNAME}/password",
                          json={"new_password": "NewPass9876"}, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text

        # login with new password -> 200
        lr = _login(self.USERNAME, "NewPass9876")
        assert lr.status_code == 200, f"after reset, login failed: {lr.status_code} {lr.text}"


# ============== C) SYNC SHEETS ==============
class TestSyncSheets:
    def test_sync_sheets_admin_ok_and_idempotent(self, admin_h):
        # initial count of KPR (should be 25 per seed)
        r = requests.get(f"{API}/kpr", headers=admin_h, timeout=60)
        assert r.status_code == 200
        n_before = len(r.json())

        r1 = requests.post(f"{API}/admin/sync-sheets", headers=admin_h, timeout=120)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert "units" in d1 and "kpr" in d1 and "legalitas" in d1 and "pesan" in d1
        assert d1["kpr"] == 25, f"first sync kpr count {d1['kpr']}"

        # run again - must be idempotent
        r2 = requests.post(f"{API}/admin/sync-sheets", headers=admin_h, timeout=120)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["kpr"] == 25

        # Totals in DB after two syncs: GET /api/kpr still 25 (no duplication)
        rc = requests.get(f"{API}/kpr", headers=admin_h, timeout=60)
        assert rc.status_code == 200
        n_after = len(rc.json())
        assert n_after == n_before, f"KPR duplicated after sync: before={n_before} after={n_after}"
        assert n_after == 25, f"Expected 25 KPR total, got {n_after}"

    def test_sync_sheets_marketing_forbidden(self, admin_h):
        # Create a throwaway marketing user
        uname = "TEST_mkt_sync"
        requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)
        r = requests.post(f"{API}/users",
                          json={"username": uname, "password": "Pass1234",
                                "name": "mkt sync", "role": "marketing", "marketing_name": "HAWIG"},
                          headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        tok = _login(uname, "Pass1234").json()["access_token"]
        try:
            rr = requests.post(f"{API}/admin/sync-sheets", headers=hdr(tok), timeout=60)
            assert rr.status_code == 403, f"marketing should be 403, got {rr.status_code}: {rr.text}"
        finally:
            requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)


# ============== A) ADD UNIT ==============
class TestAddUnit:
    def test_add_unit_as_admin_and_get(self, admin_h):
        payload = {"blok_kavling": "Z9/99", "tahap_konstruksi": "Pondasi", "nama_kontraktor": "Tes"}
        r = requests.post(f"{API}/units", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        rg = requests.get(f"{API}/units", headers=admin_h, timeout=30)
        assert rg.status_code == 200
        bloks = [u["blok_kavling"] for u in rg.json()]
        assert "Z9/99" in bloks

    def test_add_unit_as_admin_bangunan_ok(self, admin_h):
        uname = "TEST_bgn_unit"
        requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)
        requests.post(f"{API}/users",
                      json={"username": uname, "password": "Pass1234",
                            "name": "bgn unit", "role": "admin_bangunan"},
                      headers=admin_h, timeout=30)
        tok = _login(uname, "Pass1234").json()["access_token"]
        try:
            r = requests.post(f"{API}/units",
                              json={"blok_kavling": "Z9/98", "tahap_konstruksi": "Pondasi",
                                    "nama_kontraktor": "Bgn"},
                              headers=hdr(tok), timeout=30)
            assert r.status_code == 200, r.text
        finally:
            requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)

    def test_add_unit_as_marketing_forbidden(self, admin_h):
        uname = "TEST_mkt_unit"
        requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)
        requests.post(f"{API}/users",
                      json={"username": uname, "password": "Pass1234", "name": "mkt",
                            "role": "marketing", "marketing_name": "HAWIG"},
                      headers=admin_h, timeout=30)
        tok = _login(uname, "Pass1234").json()["access_token"]
        try:
            r = requests.post(f"{API}/units",
                              json={"blok_kavling": "Z0/01", "tahap_konstruksi": "Pondasi",
                                    "nama_kontraktor": "x"},
                              headers=hdr(tok), timeout=30)
            assert r.status_code == 403, f"marketing POST /units should be 403, got {r.status_code}"
        finally:
            requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)


# ============== B) ADD LEGALITY ==============
class TestAddLegality:
    def test_add_legality_as_admin_and_get(self, admin_h):
        payload = {"blok_kavling": "BARU1", "status_sertifikat": "Proses", "nomor_sertifikat": "",
                   "status_imb_pbg": "", "nomor_imb_pbg": "", "status_pbb": "",
                   "nop": "", "status_ssp_pph": "", "status_bphtb": "", "keterangan": "tes"}
        r = requests.put(f"{API}/legality/units/BARU1", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        rg = requests.get(f"{API}/legality/units", headers=admin_h, timeout=30)
        assert rg.status_code == 200
        bloks = [u["blok_kavling"] for u in rg.json()]
        assert "BARU1" in bloks

    def test_add_legality_as_admin_legal_ok(self, admin_h):
        uname = "TEST_lg_user"
        requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)
        requests.post(f"{API}/users",
                      json={"username": uname, "password": "Pass1234", "name": "lgu", "role": "admin_legal"},
                      headers=admin_h, timeout=30)
        tok = _login(uname, "Pass1234").json()["access_token"]
        try:
            r = requests.put(f"{API}/legality/units/BARU2",
                             json={"blok_kavling": "BARU2", "status_sertifikat": "Proses"},
                             headers=hdr(tok), timeout=30)
            assert r.status_code == 200, r.text
        finally:
            requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)

    def test_add_legality_as_marketing_forbidden(self, admin_h):
        uname = "TEST_mkt_lg"
        requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)
        requests.post(f"{API}/users",
                      json={"username": uname, "password": "Pass1234", "name": "mktlg",
                            "role": "marketing", "marketing_name": "HAWIG"},
                      headers=admin_h, timeout=30)
        tok = _login(uname, "Pass1234").json()["access_token"]
        try:
            r = requests.put(f"{API}/legality/units/BARU3",
                             json={"blok_kavling": "BARU3", "status_sertifikat": "Proses"},
                             headers=hdr(tok), timeout=30)
            assert r.status_code == 403
        finally:
            requests.delete(f"{API}/users/{uname}", headers=admin_h, timeout=30)


# ============== REGRESSION ==============
class TestRegression:
    def test_admin_login_ok(self):
        r = _login("admin", "Admin@123")
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_kpr_count_25(self, admin_h):
        r = requests.get(f"{API}/kpr", headers=admin_h, timeout=60)
        assert r.status_code == 200
        assert len(r.json()) == 25

    def test_dashboard_ok(self, admin_h):
        r = requests.get(f"{API}/dashboard", headers=admin_h, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "kpi" in d

    def test_marketing_scope_adit(self):
        r = _login("mkt_adit", "Mkt@123")
        assert r.status_code == 200, r.text
        tok = r.json()["access_token"]
        rr = requests.get(f"{API}/kpr", headers=hdr(tok), timeout=60)
        assert rr.status_code == 200
        rows = rr.json()
        assert len(rows) == 10, f"mkt_adit must see 10 rows, got {len(rows)}"
        assert all(x.get("marketing") == "ADIT" for x in rows), "SEC-001 regression: non-ADIT leak"

    def test_ai_claude_chat(self, admin_h):
        r = requests.post(f"{API}/ai/chat",
                          json={"message": "halo singkat saja", "provider": "claude"},
                          headers=admin_h, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("reply"), f"empty AI reply: {d}"
