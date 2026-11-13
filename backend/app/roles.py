"""Create and manage role profiles (one MongoDB collection per role)."""
from datetime import datetime, timezone

from pymongo import ReturnDocument

from app.database import db
from app.permissions import ROLE_COLLECTIONS, ROLES


def next_customer_id() -> str:
    year = datetime.now().year
    counter = db.counters.find_one_and_update(
        {"_id": f"customer_{year}"}, {"$inc": {"sequence": 1}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    return f"CUS-{year}-{counter['sequence']:06d}"


def create_role_profile(user: dict, role: str, phone: str = "") -> dict:
    """Insert the user's profile into their role collection.

    Customers also get a CRM customer record so workshop data can be linked to them.
    """
    assert role in ROLES
    profile = {
        "user_id": str(user["_id"]), "name": user["name"], "email": user["email"],
        "phone": phone or "", "role": role, "created_at": datetime.now(timezone.utc),
    }
    if role == "customer":
        existing = db.customers.find_one({"email": user["email"]})
        if existing:
            customer_id = existing["customer_id"]
        else:
            customer_id = next_customer_id()
            db.customers.insert_one({
                "customer_id": customer_id, "name": user["name"], "phone": phone or "",
                "email": user["email"], "address": "", "user_id": profile["user_id"],
                "created_at": profile["created_at"],
            })
        profile["customer_id"] = customer_id
    db[ROLE_COLLECTIONS[role]].update_one({"user_id": profile["user_id"]}, {"$set": profile}, upsert=True)
    db.users.update_one({"_id": user["_id"]}, {"$set": {"role": role, **({"customer_id": profile["customer_id"]} if role == "customer" else {})}})
    return profile


def remove_role_profile(user_id: str, role: str) -> None:
    db[ROLE_COLLECTIONS[role]].delete_one({"user_id": user_id})


def bootstrap_roles() -> None:
    """Run at startup: back-fill role profiles and optionally create the first admin.

    Set ADMIN_EMAIL and ADMIN_PASSWORD in .env to create an admin when none exists.
    """
    import os
    from pwdlib import PasswordHash

    for user in db.users.find():
        role = user.get("role", "admin")
        if not db[ROLE_COLLECTIONS[role]].find_one({"user_id": str(user["_id"])}):
            create_role_profile(user, role)
    email, password = os.getenv("ADMIN_EMAIL", "").strip().lower(), os.getenv("ADMIN_PASSWORD", "")
    if email and len(password) >= 8 and not db.users.find_one({"role": "admin"}):
        user = {"name": os.getenv("ADMIN_NAME", "Garage 21 Admin"), "email": email, "password_hash": PasswordHash.recommended().hash(password),
                "role": "admin", "active": True, "created_at": datetime.now(timezone.utc)}
        user["_id"] = db.users.insert_one(user).inserted_id
        create_role_profile(user, "admin")
