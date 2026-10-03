"""Iteration 4 backend tests:
- Multi-project (header X-Project-Id, CRUD, delete-guard)
- Data import correctness (Mahkota Graha I: 25 KPR, 36 units, 12 legality + perlu_tindak_lanjut)
- Dashboard marketing (per-marketing summary)
- Reminder macet (perlu_tindak_lanjut)
- Export Riwayat (xlsx with 'Riwayat Perubahan' sheet)
- AI chat / image / history
- Social auth (Google/Apple) 401 on bogus
- Email set on user + duplicate guard
- RBAC regression (admin login, create user, marketing scope)
"""
import io
import os
import zipfile
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or os.environ.get("EXPO_BACKEND_URL")
            or "https://bangun-pantau-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ----- helpers -----
def _login(username, password):
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=30)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login("admin", "Admin@123")
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def default_project(admin_h):
    """Return the Mahkota Graha I project."""
    r = requests.get(f"{API}/projects", headers=admin_h, timeout=30)
    assert r.status_code == 200
    projects = r.json()
    assert len(projects) >= 1
    mg = next((p for p in projects if "Mahkota" in p.get("name", "")), projects[0])
    return mg


def h_with_project(admin_h, project_id):
    return {**admin_h, "X-Project-Id": project_id}


# =====================================================================
# 1. Multi-project CRUD + header switch
# =====================================================================
class TestMultiProject:
    def test_list_projects_has_mahkota(self, admin_h):
        r = requests.get(f"{API}/projects", headers=admin_h, timeout=30)
        assert r.status_code == 200
        names = [p["name"] for p in r.json()]
        assert any("Mahkota" in n for n in names), f"Expected 'Mahkota Graha I' in {names}"

    def test_default_dashboard_has_25_kpr(self, admin_h, default_project):
        # No X-Project-Id → default (Mahkota Graha I)
        r = requests.get(f"{API}/dashboard", headers=admin_h, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["kpi"]["total"] == 25, f"Expected 25 KPR, got {data['kpi']['total']}"

    def test_create_second_project_and_isolation(self, admin_h, default_project):
        # Clean leftover
        existing = requests.get(f"{API}/projects", headers=admin_h, timeout=30).json()
        for p in existing:
            if p["name"] == "TEST_Proyek_Kedua":
                requests.delete(f"{API}/projects/{p['id']}", headers=admin_h, timeout=30)
        # Create new project
        r = requests.post(f"{API}/projects",
                          headers=admin_h, timeout=30,
                          json={"name": "TEST_Proyek_Kedua",
                                "company_name": "PT Lider Bahtera Toolsindo",
                                "alamat": "Jl Uji 2", "active": True})
        assert r.status_code == 200, r.text
        proj2 = r.json()
        assert proj2["name"] == "TEST_Proyek_Kedua"
        pid2 = proj2["id"]

        # List with X-Project-Id of new project should be empty
        h2 = h_with_project(admin_h, pid2)
        for ep, label in [("/kpr", "kpr"), ("/units", "units"), ("/legality/units", "legality")]:
            r = requests.get(f"{API}{ep}", headers=h2, timeout=30)
            assert r.status_code == 200, f"{ep} failed: {r.text}"
            assert r.json() == [], f"{ep} not empty for new project: {r.json()}"
        # Dashboard of new project → total=0
        rd = requests.get(f"{API}/dashboard", headers=h2, timeout=30)
        assert rd.status_code == 200
        assert rd.json()["kpi"]["total"] == 0

        # Default project still has 25 KPR
        hdef = h_with_project(admin_h, default_project["id"])
        rk = requests.get(f"{API}/kpr", headers=hdef, timeout=30)
        assert rk.status_code == 200
        assert len(rk.json()) == 25

        # DELETE project with no data OK
        rdel = requests.delete(f"{API}/projects/{pid2}", headers=admin_h, timeout=30)
        assert rdel.status_code == 200, rdel.text

    def test_cannot_delete_project_with_data(self, admin_h, default_project):
        # Create a sibling project so default is not the only one
        name = "TEST_SiblingForDelete"
        existing = requests.get(f"{API}/projects", headers=admin_h, timeout=30).json()
        for p in existing:
            if p["name"] == name:
                requests.delete(f"{API}/projects/{p['id']}", headers=admin_h, timeout=30)
        r = requests.post(f"{API}/projects", headers=admin_h, timeout=30,
                          json={"name": name, "company_name": "x", "alamat": "y", "active": True})
        assert r.status_code == 200
        try:
            # Now delete default project (has data) → must be 400 with "data" reason
            rdel = requests.delete(f"{API}/projects/{default_project['id']}", headers=admin_h, timeout=30)
            assert rdel.status_code == 400, rdel.text
            assert "data" in rdel.text.lower() or "berkas" in rdel.text.lower() or "unit" in rdel.text.lower()
        finally:
            # cleanup sibling
            sib = next((p for p in requests.get(f"{API}/projects", headers=admin_h, timeout=30).json()
                        if p["name"] == name), None)
            if sib:
                requests.delete(f"{API}/projects/{sib['id']}", headers=admin_h, timeout=30)

    def test_cannot_delete_last_project(self, admin_h, default_project):
        # Ensure only 1 project present then try delete.
        projects = requests.get(f"{API}/projects", headers=admin_h, timeout=30).json()
        if len(projects) == 1:
            r = requests.delete(f"{API}/projects/{projects[0]['id']}", headers=admin_h, timeout=30)
            assert r.status_code == 400
        else:
            # Still check: default project has data → 400
            r = requests.delete(f"{API}/projects/{default_project['id']}", headers=admin_h, timeout=30)
            assert r.status_code == 400


# =====================================================================
# 2. Data import correctness
# =====================================================================
class TestDataImport:
    def test_dashboard_kpi_total_25(self, admin_h):
        r = requests.get(f"{API}/dashboard", headers=admin_h, timeout=30)
        assert r.status_code == 200
        kpi = r.json()["kpi"]
        assert kpi["total"] == 25
        assert "macet_count" in kpi
        assert "nearing_count" in kpi

    def test_kpr_rows_have_real_marketing_names(self, admin_h):
        r = requests.get(f"{API}/kpr", headers=admin_h, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 25
        mkts = {r.get("marketing") for r in rows}
        expected = {"HAWIG", "ADIT", "WIDA", "SRI"}
        overlap = mkts & expected
        assert overlap, f"Expected real marketing names {expected} in {mkts}"
        # perlu_tindak_lanjut must be present as boolean
        for row in rows:
            assert "perlu_tindak_lanjut" in row, f"Missing perlu_tindak_lanjut in {row.get('id')}"
            assert isinstance(row["perlu_tindak_lanjut"], bool)

    def test_units_36(self, admin_h):
        r = requests.get(f"{API}/units", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert len(r.json()) == 36

    def test_legality_12(self, admin_h):
        r = requests.get(f"{API}/legality/units", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert len(r.json()) == 12


# =====================================================================
# 3. Dashboard marketing
# =====================================================================
class TestDashboardMarketing:
    def test_marketing_adit(self, admin_h):
        r = requests.get(f"{API}/dashboard/marketing?marketing=ADIT", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["marketing"] == "ADIT"
        assert data["total"] == 10, f"Expected ADIT total=10, got {data['total']}"
        for key in ("segera_diputihkan", "macet", "sp3k", "done", "bulan_ini", "target"):
            assert key in data, f"Missing {key} in response"


# =====================================================================
# 4. Reminder macet
# =====================================================================
class TestReminderMacet:
    def test_dashboard_has_macet_fields(self, admin_h):
        r = requests.get(f"{API}/dashboard", headers=admin_h, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "macet_count" in data["kpi"]
        assert "macet" in data
        assert isinstance(data["macet"], list)


# =====================================================================
# 5. Export Riwayat
# =====================================================================
class TestExport:
    def test_xlsx_has_riwayat_sheet(self, admin_token):
        # pass token via query to simulate browser download
        r = requests.get(f"{API}/reports/monthly?format=xlsx&token={admin_token}", timeout=60)
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "spreadsheetml" in ct, f"wrong content-type: {ct}"
        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as z:
            names = z.read("xl/workbook.xml").decode("utf-8", errors="ignore")
            assert "Riwayat" in names, f"Expected 'Riwayat' sheet in workbook: {names[:400]}"


# =====================================================================
# 6. AI chat / image / history
# =====================================================================
class TestAI:
    def test_chat_claude(self, admin_h):
        r = requests.post(f"{API}/ai/chat",
                          headers=admin_h, timeout=90,
                          json={"message": "Berapa total berkas KPR? Jawab singkat.", "provider": "claude"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["reply"].strip()
        assert data["session_id"]

    def test_chat_chatgpt_and_history(self, admin_h):
        r = requests.post(f"{API}/ai/chat",
                          headers=admin_h, timeout=90,
                          json={"message": "Siapa marketing dgn berkas terbanyak? Singkat.", "provider": "chatgpt"})
        assert r.status_code == 200, r.text
        session_id = r.json()["session_id"]
        assert r.json()["reply"].strip()
        # history
        rh = requests.get(f"{API}/ai/history?session_id={session_id}", headers=admin_h, timeout=30)
        assert rh.status_code == 200
        rows = rh.json()
        assert len(rows) >= 2
        assert any(m["role"] == "user" for m in rows)
        assert any(m["role"] == "assistant" for m in rows)

    def test_image(self, admin_h):
        r = requests.post(f"{API}/ai/image",
                          headers=admin_h, timeout=120,
                          json={"prompt": "simple house illustration, flat style"})
        assert r.status_code == 200, r.text
        assert "path" in r.json()
        assert r.json()["path"]


# =====================================================================
# 7. Social auth stub (bogus token → 401)
# =====================================================================
class TestSocialAuth:
    def test_google_session_bogus(self):
        r = requests.post(f"{API}/auth/session", json={"session_id": "bogus-session-xyz"}, timeout=30)
        assert r.status_code == 401, r.text

    def test_apple_bogus(self):
        r = requests.post(f"{API}/auth/apple",
                          json={"identity_token": "bogus.jwt.token"}, timeout=30)
        assert r.status_code == 401, r.text


# =====================================================================
# 8. Set email + duplicate guard
# =====================================================================
class TestUserEmail:
    def test_set_email_valid_and_duplicate(self, admin_h):
        # NOTE: creating two users without email triggers duplicate-key on sparse-unique
        # email index because email is stored as null (sparse treats null as indexed).
        # Workaround for test: give each user a unique initial email.
        u1 = {"username": "TEST_mail1", "password": "Pass@123", "name": "Mail1",
              "role": "admin_kpr", "email": "test_mail1_seed@example.com"}
        u2 = {"username": "TEST_mail2", "password": "Pass@123", "name": "Mail2",
              "role": "admin_kpr", "email": "test_mail2_seed@example.com"}
        for u in (u1, u2):
            requests.delete(f"{API}/users/{u['username']}", headers=admin_h, timeout=30)
            r = requests.post(f"{API}/users", json=u, headers=admin_h, timeout=30)
            assert r.status_code == 200, r.text
        try:
            # Change u1 email to a new valid value
            r = requests.put(f"{API}/users/{u1['username']}/email",
                             headers=admin_h, timeout=30, json={"email": "test_mail1_new@example.com"})
            assert r.status_code == 200, r.text
            # duplicate: set u2 to u1's new email
            r2 = requests.put(f"{API}/users/{u2['username']}/email",
                              headers=admin_h, timeout=30, json={"email": "test_mail1_new@example.com"})
            assert r2.status_code == 400, r2.text
        finally:
            for u in (u1, u2):
                requests.delete(f"{API}/users/{u['username']}", headers=admin_h, timeout=30)


# =====================================================================
# 9. RBAC regression
# =====================================================================
class TestRBAC:
    def test_admin_login_ok(self):
        r = _login("admin", "Admin@123")
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin_utama"

    def test_create_marketing_user_and_scope(self, admin_h):
        u = {"username": "TEST_mkt_rbac", "password": "Pass@123",
             "name": "Mkt RBAC", "role": "marketing", "marketing_name": "HAWIG"}
        requests.delete(f"{API}/users/{u['username']}", headers=admin_h, timeout=30)
        r = requests.post(f"{API}/users", json=u, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        try:
            lr = _login(u["username"], u["password"])
            assert lr.status_code == 200
            mkt_token = lr.json()["access_token"]
            mh = {"Authorization": f"Bearer {mkt_token}", "Content-Type": "application/json"}

            # Try create a KPR with different marketing name → 403
            payload = {"nama_konsumen": "TEST_RBAC_Konsumen", "blok_kavling": "ZZ-01",
                       "bank_pemroses": "BTN", "marketing": "ADIT",
                       "tahap_saat_ini": "Entry", "tanggal_booking": "2026-01-01"}
            r2 = requests.post(f"{API}/kpr", json=payload, headers=mh, timeout=30)
            assert r2.status_code == 403, f"marketing should be scoped: {r2.status_code} {r2.text}"
        finally:
            requests.delete(f"{API}/users/{u['username']}", headers=admin_h, timeout=30)
