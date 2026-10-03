"""Backend tests for Mahkota Graha KPR API."""
import os
import time
from datetime import date, timedelta

import pytest
import requests

from conftest import hdr


# =============== Auth ===============
class TestAuth:
    def test_login_admin(self, api_base):
        r = requests.post(f"{api_base}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin_utama"
        assert data["user"]["username"] == "admin"

    def test_login_wrong_password(self, api_base):
        r = requests.post(f"{api_base}/auth/login", json={"username": "admin", "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me(self, api_base, admin_headers):
        r = requests.get(f"{api_base}/auth/me", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        u = r.json()
        assert u["username"] == "admin"
        assert u["role"] == "admin_utama"

    def test_me_no_token(self, api_base):
        r = requests.get(f"{api_base}/auth/me", timeout=30)
        assert r.status_code == 401


# =============== Settings ===============
class TestSettings:
    @pytest.mark.parametrize("key", ["marketing", "banks", "kpr_stages", "construction_stages", "legality_status"])
    def test_lists_seeded(self, api_base, admin_headers, key):
        r = requests.get(f"{api_base}/settings/lists/{key}", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) > 0, f"{key} is empty"

    def test_pemutihan_days(self, api_base, admin_headers):
        r = requests.get(f"{api_base}/settings/config/pemutihan_days", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["value"] == 14

    def test_project_info(self, api_base, admin_headers):
        r = requests.get(f"{api_base}/settings/config/project_info", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        v = r.json()["value"]
        assert v["project_name"] == "Mahkota Graha Subang"
        assert v["company_name"] == "PT Lider Bahtera Toolsindo"

    def test_update_marketing_list_persists(self, api_base, admin_headers):
        # Save existing
        existing = requests.get(f"{api_base}/settings/lists/marketing", headers=admin_headers, timeout=30).json()
        new_items = [
            {"name": "Rina", "order": 0},
            {"name": "Budi", "order": 1},
            {"name": "TEST_Marketing_X", "order": 2},
        ]
        r = requests.put(f"{api_base}/settings/lists/marketing", headers=admin_headers,
                         json={"items": new_items}, timeout=30)
        assert r.status_code == 200
        got = requests.get(f"{api_base}/settings/lists/marketing", headers=admin_headers, timeout=30).json()
        names = [i["name"] for i in got["items"]]
        assert "TEST_Marketing_X" in names
        # restore
        requests.put(f"{api_base}/settings/lists/marketing", headers=admin_headers,
                     json={"items": [{"name": i["name"], "order": i.get("order", idx)}
                                     for idx, i in enumerate(existing["items"])]}, timeout=30)


# =============== Units ===============
class TestUnits:
    def test_units_seeded_eight(self, api_base, admin_headers):
        r = requests.get(f"{api_base}/units", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        units = r.json()
        bloks = {u["blok_kavling"] for u in units}
        assert {"A-01", "A-02", "A-03", "A-04", "A-05", "B-01", "B-02", "B-03"}.issubset(bloks)

    def test_persen_progres_computed(self, api_base, admin_headers):
        r = requests.get(f"{api_base}/units", headers=admin_headers, timeout=30)
        units = {u["blok_kavling"]: u for u in r.json()}
        assert units["A-02"]["persen_progres"] == 10  # Pondasi
        assert units["A-03"]["persen_progres"] == 30  # Dinding
        assert units["A-01"]["persen_progres"] == 0   # Rencana Bangun
        assert "status_bangunan" in units["A-02"]

    def test_available_units_excludes_zero_progress(self, api_base, admin_headers):
        r = requests.get(f"{api_base}/units/available", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        bloks = {u["blok_kavling"] for u in r.json()}
        assert "A-01" not in bloks  # 0%
        assert "B-01" not in bloks  # 0%
        assert "A-02" in bloks

    def test_update_unit_changes_progress(self, api_base, admin_headers):
        # Change B-03 to Finishing (95%)
        orig = requests.get(f"{api_base}/units", headers=admin_headers, timeout=30).json()
        orig_b03 = next(u for u in orig if u["blok_kavling"] == "B-03")
        payload = {
            "blok_kavling": "B-03",
            "nama_kontraktor": orig_b03.get("nama_kontraktor", ""),
            "tahap_konstruksi": "Finishing",
            "tanggal_mulai": orig_b03.get("tanggal_mulai"),
            "tanggal_target_selesai": orig_b03.get("tanggal_target_selesai"),
            "tanggal_realisasi_selesai": orig_b03.get("tanggal_realisasi_selesai"),
            "kendala_catatan": orig_b03.get("kendala_catatan", ""),
            "link_foto_dokumentasi": orig_b03.get("link_foto_dokumentasi", ""),
        }
        r = requests.put(f"{api_base}/units/B-03", headers=admin_headers, json=payload, timeout=30)
        assert r.status_code == 200
        got = requests.get(f"{api_base}/units", headers=admin_headers, timeout=30).json()
        b03 = next(u for u in got if u["blok_kavling"] == "B-03")
        assert b03["persen_progres"] == 95
        # Restore
        payload["tahap_konstruksi"] = orig_b03.get("tahap_konstruksi", "Pengecatan")
        requests.put(f"{api_base}/units/B-03", headers=admin_headers, json=payload, timeout=30)


# =============== KPR ===============
class TestKPR:
    def _cleanup_blok(self, api_base, admin_headers, blok):
        rows = requests.get(f"{api_base}/kpr", headers=admin_headers, timeout=30).json()
        for r in rows:
            if r["blok_kavling"] == blok:
                requests.delete(f"{api_base}/kpr/{r['id']}", headers=admin_headers, timeout=30)

    def test_create_kpr_valid(self, api_base, admin_headers):
        self._cleanup_blok(api_base, admin_headers, "A-02")
        body = {
            "nama_konsumen": "TEST_Konsumen_1",
            "blok_kavling": "A-02",
            "marketing": "Rina",
            "bank_pemroses": "BTN",
            "tanggal_booking": date.today().isoformat(),
            "tahap_saat_ini": "Pemberkasan",
            "keterangan": "test",
        }
        r = requests.post(f"{api_base}/kpr", headers=admin_headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert "id" in rec
        # verify list contains it with status
        rows = requests.get(f"{api_base}/kpr", headers=admin_headers, timeout=30).json()
        found = next((x for x in rows if x["id"] == rec["id"]), None)
        assert found is not None
        assert found["status"] in ("PROSES", "SP3K", "DONE", "DIPUTIHKAN")
        # cleanup
        requests.delete(f"{api_base}/kpr/{rec['id']}", headers=admin_headers, timeout=30)

    def test_create_kpr_rejects_zero_progress(self, api_base, admin_headers):
        body = {
            "nama_konsumen": "TEST_X",
            "blok_kavling": "A-01",  # 0%
            "marketing": "Rina",
            "bank_pemroses": "BTN",
            "tanggal_booking": date.today().isoformat(),
            "tahap_saat_ini": "Pemberkasan",
        }
        r = requests.post(f"{api_base}/kpr", headers=admin_headers, json=body, timeout=30)
        assert r.status_code == 400
        assert "belum" in r.json()["detail"].lower() or "0%" in r.json()["detail"]

    def test_create_kpr_rejects_duplicate(self, api_base, admin_headers):
        self._cleanup_blok(api_base, admin_headers, "A-03")
        body = {
            "nama_konsumen": "TEST_First",
            "blok_kavling": "A-03",
            "marketing": "Budi",
            "bank_pemroses": "BRI",
            "tanggal_booking": date.today().isoformat(),
            "tahap_saat_ini": "Pemberkasan",
        }
        r1 = requests.post(f"{api_base}/kpr", headers=admin_headers, json=body, timeout=30)
        assert r1.status_code == 200
        r2 = requests.post(f"{api_base}/kpr", headers=admin_headers, json={**body, "nama_konsumen": "TEST_Second"}, timeout=30)
        assert r2.status_code == 400
        assert "sudah" in r2.json()["detail"].lower()
        # cleanup
        requests.delete(f"{api_base}/kpr/{r1.json()['id']}", headers=admin_headers, timeout=30)

    def test_update_kpr_updates_timestamp_on_stage_change(self, api_base, admin_headers):
        self._cleanup_blok(api_base, admin_headers, "A-04")
        body = {
            "nama_konsumen": "TEST_Update",
            "blok_kavling": "A-04",
            "marketing": "Siti",
            "bank_pemroses": "BNI",
            "tanggal_booking": date.today().isoformat(),
            "tahap_saat_ini": "Pemberkasan",
        }
        rec = requests.post(f"{api_base}/kpr", headers=admin_headers, json=body, timeout=30).json()
        kid = rec["id"]
        rows = requests.get(f"{api_base}/kpr", headers=admin_headers, timeout=30).json()
        orig = next(x for x in rows if x["id"] == kid)
        orig_ts = orig.get("tanggal_update_terakhir")
        time.sleep(1.1)
        # update with stage change
        new_body = {**body, "tahap_saat_ini": "Entry"}
        r = requests.put(f"{api_base}/kpr/{kid}", headers=admin_headers, json=new_body, timeout=30)
        assert r.status_code == 200
        rows2 = requests.get(f"{api_base}/kpr", headers=admin_headers, timeout=30).json()
        updated = next(x for x in rows2 if x["id"] == kid)
        assert updated.get("tanggal_update_terakhir") != orig_ts
        requests.delete(f"{api_base}/kpr/{kid}", headers=admin_headers, timeout=30)

    def test_delete_kpr_adds_to_log(self, api_base, admin_headers):
        self._cleanup_blok(api_base, admin_headers, "A-05")
        body = {
            "nama_konsumen": "TEST_ToDelete",
            "blok_kavling": "A-05",
            "marketing": "Agus",
            "bank_pemroses": "Mandiri",
            "tanggal_booking": date.today().isoformat(),
            "tahap_saat_ini": "Pemberkasan",
        }
        rec = requests.post(f"{api_base}/kpr", headers=admin_headers, json=body, timeout=30).json()
        kid = rec["id"]
        r = requests.delete(f"{api_base}/kpr/{kid}", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        # Verify removed
        rows = requests.get(f"{api_base}/kpr", headers=admin_headers, timeout=30).json()
        assert not any(x["id"] == kid for x in rows)
        # Deleted log
        log = requests.get(f"{api_base}/kpr/deleted-log", headers=admin_headers, timeout=30)
        assert log.status_code == 200, log.text
        logs = log.json()
        assert any(entry.get("record", {}).get("id") == kid for entry in logs)

    def test_pemutihan_logic(self, api_base, admin_headers):
        """Set pemutihan_days=0 so any past booking becomes DIPUTIHKAN."""
        self._cleanup_blok(api_base, admin_headers, "B-02")
        # set pemutihan_days = 0
        requests.put(f"{api_base}/settings/config/pemutihan_days", headers=admin_headers, json={"value": 0}, timeout=30)
        try:
            body = {
                "nama_konsumen": "TEST_Pem",
                "blok_kavling": "B-02",
                "marketing": "Rina",
                "bank_pemroses": "BTN",
                "tanggal_booking": (date.today() - timedelta(days=10)).isoformat(),
                "tahap_saat_ini": "Pemberkasan",
            }
            rec = requests.post(f"{api_base}/kpr", headers=admin_headers, json=body, timeout=30).json()
            kid = rec["id"]
            rows = requests.get(f"{api_base}/kpr", headers=admin_headers, timeout=30).json()
            found = next(x for x in rows if x["id"] == kid)
            assert found["status"] == "DIPUTIHKAN", f"expected DIPUTIHKAN got {found['status']}"
            requests.delete(f"{api_base}/kpr/{kid}", headers=admin_headers, timeout=30)
        finally:
            requests.put(f"{api_base}/settings/config/pemutihan_days", headers=admin_headers, json={"value": 14}, timeout=30)


# =============== Legality ===============
class TestLegality:
    def test_upsert_unit_legality(self, api_base, admin_headers):
        body = {
            "blok_kavling": "A-02",
            "status_sertifikat": "Proses",
            "nomor_sertifikat": "SRT-TEST-001",
            "status_imb_pbg": "Rencana",
            "nomor_imb_pbg": "",
            "status_pbb": "Done",
            "nop": "NOP-001",
            "status_ssp_pph": "Rencana",
            "status_bphtb": "Rencana",
            "keterangan": "TEST",
        }
        r = requests.put(f"{api_base}/legality/units/A-02", headers=admin_headers, json=body, timeout=30)
        assert r.status_code == 200
        rows = requests.get(f"{api_base}/legality/units", headers=admin_headers, timeout=30).json()
        found = next((x for x in rows if x["blok_kavling"] == "A-02"), None)
        assert found is not None
        assert found["nomor_sertifikat"] == "SRT-TEST-001"

    def test_project_legality_get_put(self, api_base, admin_headers):
        payload = {
            "sertifikat_tanah_induk": "SHM 123",
            "nomor_sertifikat": "N-999",
            "imb_pbg": "ada",
            "nomor_imb_pbg": "IMB-1",
            "pkkpr": "ok",
            "slf": "ok",
            "catatan_umum": "TEST catatan",
        }
        r = requests.put(f"{api_base}/legality/project", headers=admin_headers, json=payload, timeout=30)
        assert r.status_code == 200
        g = requests.get(f"{api_base}/legality/project", headers=admin_headers, timeout=30)
        assert g.status_code == 200
        d = g.json()
        assert d.get("catatan_umum") == "TEST catatan" or (d.get("value") or {}).get("catatan_umum") == "TEST catatan"


# =============== Dashboard ===============
class TestDashboard:
    def test_dashboard_shape(self, api_base, admin_headers):
        r = requests.get(f"{api_base}/dashboard", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for key in ("kpi", "by_marketing", "by_bank", "unit_summary", "legal_summary", "nearing"):
            assert key in d, f"missing key {key}"
        assert isinstance(d["by_marketing"], list)
        assert isinstance(d["by_bank"], list)
        assert isinstance(d["nearing"], list)


# =============== RBAC ===============
class TestRBAC:
    def test_admin_kpr_can_create_kpr_but_not_edit_unit(self, api_base, admin_headers, role_tokens):
        tk = role_tokens["admin_kpr"]
        # cleanup
        rows = requests.get(f"{api_base}/kpr", headers=admin_headers, timeout=30).json()
        for r in rows:
            if r["blok_kavling"] == "A-02":
                requests.delete(f"{api_base}/kpr/{r['id']}", headers=admin_headers, timeout=30)
        body = {
            "nama_konsumen": "TEST_RBAC_KPR",
            "blok_kavling": "A-02",
            "marketing": "Rina",
            "bank_pemroses": "BTN",
            "tanggal_booking": date.today().isoformat(),
            "tahap_saat_ini": "Pemberkasan",
        }
        r = requests.post(f"{api_base}/kpr", headers=hdr(tk), json=body, timeout=30)
        assert r.status_code == 200, r.text
        kid = r.json()["id"]
        # Can't edit unit
        unit_body = {"blok_kavling": "A-02", "tahap_konstruksi": "Dinding"}
        r2 = requests.put(f"{api_base}/units/A-02", headers=hdr(tk), json=unit_body, timeout=30)
        assert r2.status_code == 403
        # Can't create user
        r3 = requests.post(f"{api_base}/users", headers=hdr(tk),
                           json={"username": "TEST_x", "password": "x", "name": "x", "role": "admin_kpr"}, timeout=30)
        assert r3.status_code == 403
        requests.delete(f"{api_base}/kpr/{kid}", headers=admin_headers, timeout=30)

    def test_admin_bangunan_can_edit_unit_not_kpr(self, api_base, admin_headers, role_tokens):
        tk = role_tokens["admin_bangunan"]
        # get current A-04
        units = requests.get(f"{api_base}/units", headers=admin_headers, timeout=30).json()
        orig = next(u for u in units if u["blok_kavling"] == "A-04")
        payload = {
            "blok_kavling": "A-04",
            "nama_kontraktor": orig.get("nama_kontraktor", ""),
            "tahap_konstruksi": "Plafon",
            "tanggal_mulai": orig.get("tanggal_mulai"),
            "tanggal_target_selesai": orig.get("tanggal_target_selesai"),
        }
        r = requests.put(f"{api_base}/units/A-04", headers=hdr(tk), json=payload, timeout=30)
        assert r.status_code == 200
        # restore
        payload["tahap_konstruksi"] = orig.get("tahap_konstruksi")
        requests.put(f"{api_base}/units/A-04", headers=admin_headers, json=payload, timeout=30)
        # not allowed to create KPR
        kbody = {
            "nama_konsumen": "x", "blok_kavling": "A-02", "marketing": "Rina", "bank_pemroses": "BTN",
            "tanggal_booking": date.today().isoformat(), "tahap_saat_ini": "Pemberkasan",
        }
        r2 = requests.post(f"{api_base}/kpr", headers=hdr(tk), json=kbody, timeout=30)
        assert r2.status_code == 403

    def test_admin_legal_can_edit_legality_not_kpr(self, api_base, role_tokens):
        tk = role_tokens["admin_legal"]
        body = {
            "blok_kavling": "A-03", "status_sertifikat": "Proses", "nomor_sertifikat": "LEG-RBAC-001",
            "status_imb_pbg": "", "nomor_imb_pbg": "", "status_pbb": "", "nop": "",
            "status_ssp_pph": "", "status_bphtb": "", "keterangan": "",
        }
        r = requests.put(f"{api_base}/legality/units/A-03", headers=hdr(tk), json=body, timeout=30)
        assert r.status_code == 200
        kbody = {
            "nama_konsumen": "x", "blok_kavling": "A-02", "marketing": "Rina", "bank_pemroses": "BTN",
            "tanggal_booking": date.today().isoformat(), "tahap_saat_ini": "Pemberkasan",
        }
        r2 = requests.post(f"{api_base}/kpr", headers=hdr(tk), json=kbody, timeout=30)
        assert r2.status_code == 403

    def test_users_requires_admin_utama(self, api_base, role_tokens):
        r = requests.get(f"{api_base}/users", headers=hdr(role_tokens["admin_kpr"]), timeout=30)
        assert r.status_code == 403
        r2 = requests.get(f"{api_base}/users", timeout=30)
        assert r2.status_code == 401


# =============== User management ===============
class TestUsers:
    def test_create_and_delete_user(self, api_base, admin_headers):
        requests.delete(f"{api_base}/users/TEST_tmpuser", headers=admin_headers, timeout=30)
        r = requests.post(f"{api_base}/users", headers=admin_headers,
                          json={"username": "TEST_tmpuser", "password": "Pass@123", "name": "Tmp", "role": "admin_kpr"},
                          timeout=30)
        assert r.status_code == 200
        users = requests.get(f"{api_base}/users", headers=admin_headers, timeout=30).json()
        assert any(u["username"] == "TEST_tmpuser" for u in users)
        d = requests.delete(f"{api_base}/users/TEST_tmpuser", headers=admin_headers, timeout=30)
        assert d.status_code == 200
        users2 = requests.get(f"{api_base}/users", headers=admin_headers, timeout=30).json()
        assert not any(u["username"] == "TEST_tmpuser" for u in users2)

    def test_cannot_delete_admin(self, api_base, admin_headers):
        r = requests.delete(f"{api_base}/users/admin", headers=admin_headers, timeout=30)
        assert r.status_code == 400
