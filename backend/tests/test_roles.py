"""Role access tests. Run from the backend folder:  python -m pytest tests -q
Uses an in-memory MongoDB (mongomock), so no database server is needed."""
import os, sys
import mongomock, pymongo
pymongo.MongoClient = mongomock.MongoClient
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["ADMIN_PASSWORD"] = "AdminPass#2026"
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def login(c, email, password):
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}, r.json()["user"]


@pytest.fixture(scope="module")
def users(client):
    admin, _ = login(client, "admin@example.com", "AdminPass#2026")
    for name, role in (("Mia Mechanic", "mechanic"), ("Eli Employee", "employee")):
        r = client.post("/api/users/", headers=admin, json={"name": name, "email": f"{role}@example.com", "password": "Password#123", "role": role})
        assert r.status_code == 201, r.text
    r = client.post("/api/auth/register", json={"name": "Cara Customer", "email": "cara@example.com", "password": "Password#123", "phone": "9876543210"})
    assert r.status_code == 201
    r2 = client.post("/api/auth/register", json={"name": "Other Owner", "email": "other@example.com", "password": "Password#123"})
    h = {"admin": admin}
    for role, email in (("mechanic", "mechanic@example.com"), ("employee", "employee@example.com"), ("customer", "cara@example.com"), ("other", "other@example.com")):
        h[role], u = login(client, email, "Password#123")
        h[role + "_user"] = u
    return h


def test_public_register_is_customer_only(client, users):
    assert users["customer_user"]["role"] == "customer"
    assert users["customer_user"]["customer_id"].startswith("CUS-")


def test_four_role_collections_have_profiles(client, users):
    s = {x["role"]: x["count"] for x in client.get("/api/users/summary", headers=users["admin"]).json()}
    assert s["admin"] >= 1 and s["mechanic"] == 1 and s["employee"] == 1 and s["customer"] == 2


def test_admin_sees_everything(client, users):
    a = users["admin"]
    assert client.get("/api/customers/", headers=a).status_code == 200
    assert client.get("/api/reports/summary", headers=a).status_code == 200
    assert len(client.get("/api/modules", headers=a).json()) == 21
    assert client.get("/api/users/", headers=a).status_code == 200


def test_employee_only_staff_pages(client, users):
    e = users["employee"]
    keys = {m["key"] for m in client.get("/api/modules", headers=e).json()}
    assert keys == {"employees", "attendance", "leave"}
    assert client.post("/api/modules/attendance", headers=e, json={"data": {"employee_name": "Eli"}}).status_code == 200
    for path in ("/api/customers/", "/api/vehicles/", "/api/service-jobs/", "/api/reports/summary", "/api/users/", "/api/modules/invoices"):
        assert client.get(path, headers=e).status_code == 403, path


def test_mechanic_only_working_pages(client, users):
    m, a = users["mechanic"], users["admin"]
    keys = {x["key"]: x["access"] for x in client.get("/api/modules", headers=m).json()}
    assert keys == {"inspections": "rw", "quality-control": "rw", "time-logs": "rw", "inventory": "r"}
    assert client.post("/api/modules/inventory", headers=m, json={"data": {"part_name": "x"}}).status_code == 403
    assert client.post("/api/modules/time-logs", headers=m, json={"data": {"task": "brakes"}}).status_code == 200
    assert client.get("/api/modules/invoices", headers=m).status_code == 403
    assert client.get("/api/modules/employees", headers=m).status_code == 403
    assert client.get("/api/users/", headers=m).status_code == 403
    assert client.post("/api/customers/", headers=m, json={"name": "Zed Zed", "phone": "9999999999"}).status_code == 403
    assert client.get("/api/reports/summary", headers=m).status_code == 403


def test_customer_scoped_to_own_data(client, users):
    c, o, a, m = users["customer"], users["other"], users["admin"], users["mechanic"]
    cid, oid = users["customer_user"]["customer_id"], users["other_user"]["customer_id"]
    assert [x["customer_id"] for x in client.get("/api/customers/", headers=c).json()] == [cid]
    assert client.get(f"/api/customers/{oid}", headers=c).status_code == 403
    assert client.post("/api/customers/", headers=c, json={"name": "Zed Zed", "phone": "9999999999"}).status_code == 403
    # vehicles: own only
    assert client.post("/api/vehicles/", headers=c, json={"customer_id": oid, "registration_number": "TN01AA0001", "make": "A", "model": "B"}).status_code == 403
    v = client.post("/api/vehicles/", headers=c, json={"customer_id": cid, "registration_number": "TN01AA0002", "make": "Kia", "model": "Seltos"})
    assert v.status_code == 200
    client.post("/api/vehicles/", headers=o, json={"customer_id": oid, "registration_number": "TN01AA0003", "make": "Audi", "model": "A4"})
    assert [x["registration_number"] for x in client.get("/api/vehicles/", headers=c).json()] == ["TN01AA0002"]
    # jobs: mechanic/admin create, customer sees own only
    j = client.post("/api/service-jobs/", headers=m, json={"customer_id": cid, "vehicle_id": v.json()["vehicle_id"], "complaint": "noise"})
    assert j.status_code == 200
    assert len(client.get("/api/service-jobs/", headers=c).json()) == 1
    assert client.get("/api/service-jobs/", headers=o).json() == []
    assert client.post("/api/service-jobs/", headers=c, json={"customer_id": cid, "vehicle_id": v.json()["vehicle_id"], "complaint": "x y z"}).status_code == 403
    assert client.patch(f"/api/service-jobs/{j.json()['job_id']}/status?status=Inspection", headers=c).status_code == 403
    assert client.patch(f"/api/service-jobs/{j.json()['job_id']}/status?status=Inspection", headers=m).status_code == 200
    # modules: own records only
    r = client.post("/api/modules/feedback", headers=c, json={"data": {"comments": "great", "rating": 5}})
    assert r.status_code == 200
    assert len(client.get("/api/modules/feedback", headers=c).json()) == 1
    assert client.get("/api/modules/feedback", headers=o).json() == []
    assert len(client.get("/api/modules/feedback", headers=a).json()) == 1
    assert client.patch(f"/api/modules/feedback/{r.json()['record_id']}", headers=o, json={"data": {"comments": "hacked"}}).status_code == 404
    assert client.get("/api/modules/invoices", headers=c).status_code == 403
    assert client.get("/api/modules/employees", headers=c).status_code == 403
    assert client.get("/api/reports/summary", headers=c).status_code == 403
    assert client.post("/api/ai/assistant", headers=c, json={"prompt": "hi"}).status_code == 403


def test_user_management_rules(client, users):
    a = users["admin"]
    admin_id = client.get("/api/auth/me", headers=a).json()["id"]
    assert client.patch(f"/api/users/{admin_id}", headers=a, json={"role": "employee"}).status_code == 409
    mid = users["mechanic_user"]["id"]
    assert client.patch(f"/api/users/{mid}", headers=a, json={"role": "employee"}).status_code == 200
    s = {x["role"]: x["count"] for x in client.get("/api/users/summary", headers=a).json()}
    assert s["mechanic"] == 0 and s["employee"] == 2
    # old session is signed out after a role change
    assert client.get("/api/auth/me", headers=users["mechanic"]).status_code == 401
    assert client.patch(f"/api/users/{mid}", headers=a, json={"active": False}).status_code == 200
    r = client.post("/api/auth/login", json={"email": "mechanic@example.com", "password": "Password#123"})
    assert r.status_code == 403


def test_unauthenticated_blocked(client):
    for path in ("/api/customers/", "/api/modules", "/api/users/"):
        assert client.get(path).status_code == 401
