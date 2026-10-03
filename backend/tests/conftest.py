import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "https://bangun-pantau-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api_base():
    return API


@pytest.fixture(scope="session")
def admin_token(api_base):
    r = requests.post(f"{api_base}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _login(api_base, username, password):
    r = requests.post(f"{api_base}/auth/login", json={"username": username, "password": password}, timeout=30)
    return r


@pytest.fixture(scope="session")
def role_tokens(api_base, admin_headers):
    """Create test users for each role and return their bearer tokens."""
    users = {
        "admin_kpr":      {"username": "TEST_kpr",      "password": "Pass@123", "name": "Test KPR",   "role": "admin_kpr"},
        "admin_bangunan": {"username": "TEST_bangunan", "password": "Pass@123", "name": "Test Bang.", "role": "admin_bangunan"},
        "admin_legal":    {"username": "TEST_legal",    "password": "Pass@123", "name": "Test Legal", "role": "admin_legal"},
    }
    tokens = {}
    for _, body in users.items():
        requests.delete(f"{api_base}/users/{body['username']}", headers=admin_headers, timeout=30)
        r = requests.post(f"{api_base}/users", json=body, headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"create user {body['username']} failed: {r.text}"
        lr = _login(api_base, body["username"], body["password"])
        assert lr.status_code == 200, f"login {body['username']} failed: {lr.text}"
        tokens[body["role"]] = lr.json()["access_token"]
    yield tokens
    for _, body in users.items():
        requests.delete(f"{api_base}/users/{body['username']}", headers=admin_headers, timeout=30)


def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
