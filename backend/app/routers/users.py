from datetime import datetime, timezone
from typing import Annotated, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError
from pwdlib import PasswordHash

from app.auth import get_current_user
from app.database import db
from app.permissions import ROLE_COLLECTIONS, ROLE_LABELS, ROLES, require_roles
from app.roles import create_role_profile, remove_role_profile

router = APIRouter(prefix="/api/users", tags=["Users and roles"])
password_hash = PasswordHash.recommended()
Role = Literal["admin", "customer", "mechanic", "employee"]


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Role
    phone: str = Field(default="", max_length=15)


class UserUpdate(BaseModel):
    role: Role | None = None
    active: bool | None = None


def _out(user: dict) -> dict:
    role = user.get("role", "admin")
    return {
        "id": str(user["_id"]), "name": user["name"], "email": user["email"], "role": role,
        "role_label": ROLE_LABELS.get(role, role), "active": user.get("active", True),
        "created_at": user.get("created_at"),
    }


def _admin_count() -> int:
    return db.users.count_documents({"role": "admin", "active": {"$ne": False}})


@router.get("/")
def list_users(me: Annotated[dict, Depends(get_current_user)]):
    require_roles(me, "admin")
    return [_out(u) for u in db.users.find().sort("created_at", -1).limit(500)]


@router.get("/summary")
def role_summary(me: Annotated[dict, Depends(get_current_user)]):
    """Account counts for each of the four role databases."""
    require_roles(me, "admin")
    return [{"role": r, "label": ROLE_LABELS[r], "collection": ROLE_COLLECTIONS[r], "count": db[ROLE_COLLECTIONS[r]].count_documents({})} for r in ROLES]


@router.post("/", status_code=201)
def create_user(payload: UserCreate, me: Annotated[dict, Depends(get_current_user)]):
    require_roles(me, "admin")
    email = payload.email.lower().strip()
    user = {
        "name": payload.name.strip(), "email": email, "password_hash": password_hash.hash(payload.password),
        "role": payload.role, "active": True, "created_at": datetime.now(timezone.utc),
    }
    try:
        user["_id"] = db.users.insert_one(user).inserted_id
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    create_role_profile(user, payload.role, payload.phone.strip())
    return _out(db.users.find_one({"_id": user["_id"]}))


@router.patch("/{user_id}")
def update_user(user_id: str, payload: UserUpdate, me: Annotated[dict, Depends(get_current_user)]):
    require_roles(me, "admin")
    try:
        target = db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        target = None
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    old_role = target.get("role", "admin")
    new_role = payload.role or old_role
    new_active = target.get("active", True) if payload.active is None else payload.active
    # Never leave the workshop without an active admin.
    if old_role == "admin" and (new_role != "admin" or not new_active) and _admin_count() <= 1:
        raise HTTPException(status_code=409, detail="At least one active admin account is required.")
    if str(target["_id"]) == me["id"] and (new_role != "admin" or not new_active):
        raise HTTPException(status_code=409, detail="You cannot remove your own admin access.")
    changes = {"active": new_active}
    if new_role != old_role:
        remove_role_profile(str(target["_id"]), old_role)
        changes["token_version"] = int(target.get("token_version", 0)) + 1  # sign them out of old session
    db.users.update_one({"_id": target["_id"]}, {"$set": changes})
    if new_role != old_role:
        create_role_profile(db.users.find_one({"_id": target["_id"]}), new_role)
    return _out(db.users.find_one({"_id": target["_id"]}))
