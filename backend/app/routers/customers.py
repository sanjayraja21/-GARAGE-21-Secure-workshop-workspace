
from datetime import datetime, timezone

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.database import db, serialize_document
from app.schemas import CustomerCreate
from app.auth import get_current_user
from app.permissions import require_roles
from app.roles import next_customer_id

router = APIRouter(
    prefix="/api/customers",
    tags=["Customers"]
)


@router.post("/")
def create_customer(customer: CustomerCreate, user: Annotated[dict, Depends(get_current_user)]):
    require_roles(user, "admin")
    try:
        data = customer.model_dump()
        data["customer_id"] = next_customer_id()
        data["created_at"] = datetime.now(timezone.utc)

        db.customers.insert_one(data)

        return serialize_document(
            db.customers.find_one(
                {"customer_id": data["customer_id"]}
            )
        )

    except DuplicateKeyError:
        raise HTTPException(
            status_code=409,
            detail="Customer already exists."
        )
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Database operation failed."
        )


@router.get("/")
def get_customers(user: Annotated[dict, Depends(get_current_user)]):
    require_roles(user, "admin", "mechanic", "customer")
    query = {"customer_id": user.get("customer_id")} if user["role"] == "customer" else {}
    customers = db.customers.find(query).sort(
        "created_at", -1
    ).limit(500)

    return [
        serialize_document(customer)
        for customer in customers
    ]


@router.get("/{customer_id}")
def get_customer(customer_id: str, user: Annotated[dict, Depends(get_current_user)]):
    require_roles(user, "admin", "mechanic", "customer")
    if user["role"] == "customer" and customer_id != user.get("customer_id"):
        raise HTTPException(status_code=403, detail="You can only view your own profile.")
    customer = db.customers.find_one(
        {"customer_id": customer_id}
    )

    if not customer:
        raise HTTPException(
            status_code=404,
            detail="Customer not found."
        )

    return serialize_document(customer)
