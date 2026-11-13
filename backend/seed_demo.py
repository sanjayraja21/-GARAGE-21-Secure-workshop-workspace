"""Create one demo account per role (admin, customer, mechanic, employee).

Run from the backend folder with MongoDB running:
    python seed_demo.py

Demo accounts are for local testing only. Delete them or change their passwords
before sharing the app with anyone else.
"""
import os
from datetime import datetime, timezone

from pwdlib import PasswordHash

from app.database import db, initialize_database
from app.roles import create_role_profile, bootstrap_roles

PASSWORD = os.getenv("DEMO_PASSWORD", "Garage21@Demo")
ACCOUNTS = [
    ("Garage 21 Admin", "admin@example.com", "admin", ""),
    ("Arun Kumar", "customer@example.com", "customer", "9876543210"),
    ("Mani Mechanic", "mechanic@example.com", "mechanic", "9876500001"),
    ("Esha Employee", "employee@example.com", "employee", "9876500002"),
]

initialize_database()
hasher = PasswordHash.recommended()
for name, email, role, phone in ACCOUNTS:
    user = db.users.find_one({"email": email})
    if not user:
        user = {"name": name, "email": email, "password_hash": hasher.hash(PASSWORD), "role": role,
                "active": True, "created_at": datetime.now(timezone.utc)}
        user["_id"] = db.users.insert_one(user).inserted_id
    create_role_profile(user, role, phone)
    print(f"{role:9} {email}")

# A sample vehicle and job so the customer and mechanic pages have something to show.
customer = db.customers.find_one({"email": "customer@example.com"})
if customer and not db.vehicles.find_one({"registration_number": "TN01AB1234"}):
    now = datetime.now(timezone.utc)
    db.vehicles.insert_one({"vehicle_id": "VEH-DEMO-000001", "customer_id": customer["customer_id"], "registration_number": "TN01AB1234",
                            "make": "Nissan", "model": "GT-R", "year": 2022, "odometer": 12000, "created_at": now})
    db.service_jobs.insert_one({"job_id": "JOB-DEMO-000001", "customer_id": customer["customer_id"], "vehicle_id": "VEH-DEMO-000001",
                                "complaint": "Brake noise at low speed", "estimated_cost": 8500, "mechanic_name": "Mani Mechanic",
                                "status": "Inspection", "created_at": now, "updated_at": now,
                                "status_history": [{"status": "Inspection", "changed_at": now}]})
bootstrap_roles()
print(f"\nPassword for all demo accounts: {PASSWORD}")
