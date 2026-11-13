
from datetime import datetime, timezone

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.database import db, serialize_document
from app.schemas import ServiceJobCreate
from app.auth import get_current_user
from app.permissions import require_roles

router = APIRouter(
    prefix="/api/service-jobs",
    tags=["Service Jobs"]
)

JOB_STATUSES = [
    "Received",
    "Inspection",
    "Waiting for Approval",
    "Repairing",
    "Quality Check",
    "Ready for Delivery",
    "Delivered",
]


def generate_job_id():
    year = datetime.now().year

    counter = db.counters.find_one_and_update(
        {"_id": f"job_{year}"},
        {"$inc": {"sequence": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )

    return f"JOB-{year}-{counter['sequence']:06d}"


@router.post("/")
def create_job(job: ServiceJobCreate, user: Annotated[dict, Depends(get_current_user)]):
    require_roles(user, "admin", "mechanic")
    if not db.customers.find_one(
        {"customer_id": job.customer_id}
    ):
        raise HTTPException(
            status_code=404,
            detail="Customer not found."
        )

    vehicle = db.vehicles.find_one(
        {"vehicle_id": job.vehicle_id}
    )

    if not vehicle:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found."
        )

    if vehicle["customer_id"] != job.customer_id:
        raise HTTPException(
            status_code=400,
            detail="Vehicle does not belong to this customer."
        )

    now = datetime.now(timezone.utc)
    data = job.model_dump()

    data.update({
        "job_id": generate_job_id(),
        "status": "Received",
        "created_at": now,
        "updated_at": now,
        "status_history": [{
            "status": "Received",
            "changed_at": now
        }]
    })

    try:
        db.service_jobs.insert_one(data)

        return serialize_document(
            db.service_jobs.find_one(
                {"job_id": data["job_id"]}
            )
        )
    except DuplicateKeyError:
        raise HTTPException(
            status_code=409,
            detail="Service job already exists."
        )
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Database operation failed."
        )


@router.get("/")
def get_jobs(user: Annotated[dict, Depends(get_current_user)], status: str = None):
    require_roles(user, "admin", "mechanic", "customer")
    query = {}
    if user["role"] == "customer":
        query["customer_id"] = user.get("customer_id")

    if status:
        if status not in JOB_STATUSES:
            raise HTTPException(
                status_code=400,
                detail="Invalid service status."
            )
        query["status"] = status

    jobs = db.service_jobs.find(query).sort(
        "created_at", -1
    ).limit(500)

    return [
        serialize_document(job)
        for job in jobs
    ]


@router.patch("/{job_id}/status")
def update_job_status(
    job_id: str,
    user: Annotated[dict, Depends(get_current_user)],
    status: str = Query(...)
):
    require_roles(user, "admin", "mechanic")
    if status not in JOB_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid service status."
        )

    if status in {"Ready for Delivery", "Delivered"}:
        qc_record = db["quality-control"].find_one({
            "job_id": job_id,
            "approved": {"$in": ["Yes", "yes", True, "Approved", "approved"]}
        })
        if not qc_record:
            raise HTTPException(
                status_code=409,
                detail="Quality check approval is required before marking this job ready for delivery or delivered. Add an approved record in Quality control first."
            )

    now = datetime.now(timezone.utc)

    updated = db.service_jobs.find_one_and_update(
        {"job_id": job_id},
        {
            "$set": {
                "status": status,
                "updated_at": now
            },
            "$push": {
                "status_history": {
                    "status": status,
                    "changed_at": now
                }
            }
        },
        return_document=ReturnDocument.AFTER
    )

    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Service job not found."
        )

    db.notifications.insert_one({
        "record_id": f"NOT-{int(now.timestamp())}",
        "title": "Job status updated",
        "message": f"{job_id} moved to {status}.",
        "category": "service-jobs",
        "read": False,
        "created_at": now
    })
    db["audit-logs"].insert_one({
        "record_id": f"AUD-{int(now.timestamp())}",
        "actor": f"{user['name']} ({user['role']})",
        "action": "STATUS_UPDATE",
        "entity": "Service Job",
        "entity_id": job_id,
        "details": f"Status changed to {status}",
        "created_at": now
    })

    return serialize_document(updated)
