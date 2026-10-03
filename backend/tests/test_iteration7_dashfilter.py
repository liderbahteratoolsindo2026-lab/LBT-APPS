"""Iteration 7 - Dashboard filter bulan bug fix tests."""
import os
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def mkt_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"username": "mkt_adit", "password": "Mkt@123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _get(path, token, params=None):
    r = requests.get(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"}, params=params or {}, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    return r.json()


# ---- Filter bulan (BUG FIX utama) ----
def test_dashboard_no_month(admin_token):
    d = _get("/api/dashboard", admin_token)
    assert d["kpi"]["total"] == 25, d["kpi"]


def test_dashboard_month_2026_09(admin_token):
    d = _get("/api/dashboard", admin_token, {"month": "2026-09"})
    assert d["kpi"]["total"] == 4, d["kpi"]


def test_dashboard_month_2026_10_has_data(admin_token):
    d = _get("/api/dashboard", admin_token, {"month": "2026-10"})
    assert d["kpi"]["total"] > 0, d["kpi"]


def test_dashboard_month_2026_06_empty(admin_token):
    d = _get("/api/dashboard", admin_token, {"month": "2026-06"})
    assert d["kpi"]["total"] == 0, d["kpi"]


# ---- Filter marketing (regresi) ----
def test_dashboard_marketing_adit(admin_token):
    d = _get("/api/dashboard", admin_token, {"marketing": "ADIT"})
    assert d["kpi"]["total"] == 10, d["kpi"]


def test_dashboard_month_and_marketing_subset(admin_token):
    d_all_adit = _get("/api/dashboard", admin_token, {"marketing": "ADIT"})
    d_sep_adit = _get("/api/dashboard", admin_token, {"month": "2026-09", "marketing": "ADIT"})
    assert d_sep_adit["kpi"]["total"] <= d_all_adit["kpi"]["total"]
    # semua rows milik ADIT
    for r in d_sep_adit.get("kpr_rows", []):
        assert r.get("marketing") == "ADIT"


# ---- Scope marketing login (regresi SEC-001) ----
def test_marketing_login_sees_only_own(mkt_token):
    d = _get("/api/dashboard", mkt_token)
    assert d["kpi"]["total"] == 10, d["kpi"]
    for r in d.get("kpr_rows", []):
        assert r.get("marketing") == "ADIT"


# ---- Ekspor laporan untuk bulan terpilih ----
def test_report_xlsx_month(admin_token):
    r = requests.get(f"{BASE}/api/reports/monthly",
                     headers={"Authorization": f"Bearer {admin_token}"},
                     params={"month": "2026-09", "format": "xlsx"}, timeout=60)
    assert r.status_code == 200, r.text
    assert len(r.content) > 100
    ctype = r.headers.get("Content-Type", "")
    assert "spreadsheet" in ctype or "octet" in ctype or "xlsx" in ctype, ctype


# ---- AI chat claude tetap balas ----
def test_ai_chat_claude(admin_token):
    r = requests.post(f"{BASE}/api/ai/chat",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      json={"message": "Halo singkat saja", "provider": "claude"}, timeout=90)
    assert r.status_code == 200, r.text
    body = r.json()
    reply = body.get("reply") or body.get("text") or body.get("message") or ""
    assert isinstance(reply, str) and len(reply.strip()) > 0, body
