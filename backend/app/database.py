
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

MONGODB_URL = os.getenv(
    "MONGODB_URL",
    "mongodb://localhost:27017"
)
DATABASE_NAME = os.getenv(
    "MONGODB_DATABASE",
    "garage_pro"
)

client = MongoClient(
    MONGODB_URL,
    serverSelectionTimeoutMS=5000
)

db = client[DATABASE_NAME]


def initialize_database():
    """Check MongoDB and create indexes."""
    client.admin.command("ping")

    db.users.create_index("email", unique=True)

    # One collection per role: admin, customer, mechanic and employee profiles.
    for collection in ("admin_profiles", "customer_profiles", "mechanic_profiles", "employee_profiles"):
        db[collection].create_index("user_id", unique=True)

    # Accounts created before roles existed belonged to the workshop owner.
    db.users.update_many({"role": {"$exists": False}}, {"$set": {"role": "admin", "active": True}})

    db.customers.create_index(
        "customer_id",
        unique=True
    )

    db.vehicles.create_index(
        "vehicle_id",
        unique=True
    )

    db.vehicles.create_index(
        "registration_number",
        unique=True
    )

    db.service_jobs.create_index(
        "job_id",
        unique=True
    )

    db.service_jobs.create_index("customer_id")
    db.service_jobs.create_index("vehicle_id")

    # Useful indexes for the extended Garage 21 modules.
    db.appointments.create_index([("date", 1), ("time_slot", 1)])
    db.inventory.create_index("sku")
    db.invoices.create_index("job_id")
    db.notifications.create_index([("read", 1), ("created_at", -1)])
    db["audit-logs"].create_index("created_at")


def serialize_document(document):
    """Convert MongoDB ObjectId into a string."""
    if document and "_id" in document:
        document["_id"] = str(document["_id"])

    return document
