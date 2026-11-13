
from datetime import datetime, timezone

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.database import db, serialize_document
from app.schemas import VehicleCreate
from app.auth import get_current_user
from app.permissions import require_roles

router = APIRouter(
    prefix="/api/vehicles",
    tags=["Vehicles"]
)


def generate_vehicle_id():
    year = datetime.now().year

    counter = db.counters.find_one_and_update(
        {"_id": f"vehicle_{year}"},
        {"$inc": {"sequence": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )

    return f"VEH-{year}-{counter['sequence']:06d}"


@router.post("/")
def create_vehicle(vehicle: VehicleCreate, user: Annotated[dict, Depends(get_current_user)]):
    require_roles(user, "admin", "customer")
    if user["role"] == "customer" and vehicle.customer_id != user.get("customer_id"):
        raise HTTPException(status_code=403, detail="You can only register vehicles for your own profile.")
    if not db.customers.find_one(
        {"customer_id": vehicle.customer_id}
    ):
        raise HTTPException(
            status_code=404,
            detail="Customer not found."
        )

    data = vehicle.model_dump()
    data["vehicle_id"] = generate_vehicle_id()
    data["registration_number"] = (
        data["registration_number"].strip().upper()
    )
    data["created_at"] = datetime.now(timezone.utc)

    try:
        db.vehicles.insert_one(data)

        return serialize_document(
            db.vehicles.find_one(
                {"vehicle_id": data["vehicle_id"]}
            )
        )

    except DuplicateKeyError:
        raise HTTPException(
            status_code=409,
            detail="Registration number already exists."
        )
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Database operation failed."
        )


@router.get("/")
def get_vehicles(user: Annotated[dict, Depends(get_current_user)], customer_id: str = None):
    require_roles(user, "admin", "mechanic", "customer")
    query = {}
    if user["role"] == "customer":
        customer_id = user.get("customer_id")

    if customer_id:
        query["customer_id"] = customer_id

    vehicles = db.vehicles.find(query).sort(
        "created_at", -1
    ).limit(500)

    return [
        serialize_document(vehicle)
        for vehicle in vehicles
    ]
