from datetime import datetime, timezone
from typing import Any
import os
import urllib.request
import urllib.error

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from app.database import db, serialize_document
from app.auth import get_current_user
from app.permissions import module_access, require_module, require_roles

router = APIRouter(tags=["Garage 21 Modules"])

MODULES = {
    "appointments": ("Appointment", ["customer_name", "registration_number", "service", "date", "time_slot", "status", "notes"]),
    "inspections": ("Inspection", ["job_id", "fuel_level", "odometer", "damage_notes", "accessories", "customer_complaint", "photos_note", "handover_confirmed"]),
    "estimates": ("Estimate", ["job_id", "labour", "parts", "tax_rate", "total", "customer_approval", "notes"]),
    "invoices": ("Invoice", ["job_id", "customer_name", "subtotal", "tax", "total", "paid", "balance", "status", "due_date"]),
    "payments": ("Payment", ["invoice_id", "amount", "method", "reference", "status", "paid_at"]),
    "inventory": ("Part", ["part_name", "sku", "quantity", "reorder_level", "unit_cost", "supplier", "location"]),
    "suppliers": ("Supplier", ["name", "phone", "email", "address", "notes"]),
    "employees": ("Employee", ["name", "role", "skills", "phone", "branch", "availability", "active"]),
    "attendance": ("Attendance", ["employee_name", "date", "check_in", "check_out", "shift", "status"]),
    "leave": ("Leave Request", ["employee_name", "start_date", "end_date", "reason", "status", "reviewed_by"]),
    "quality-control": ("Quality Check", ["job_id", "inspector", "checklist", "defects", "test_drive", "approved", "notes"]),
    "feedback": ("Feedback", ["customer_name", "job_id", "rating", "comments", "complaint_status", "follow_up"]),
    "warranties": ("Warranty", ["job_id", "vehicle", "coverage", "start_date", "end_date", "provider", "notes"]),
    "maintenance": ("Maintenance Reminder", ["customer_name", "vehicle", "service_due", "due_date", "odometer", "status"]),
    "branches": ("Branch", ["name", "address", "phone", "manager", "active"]),
    "purchase-orders": ("Purchase Order", ["supplier", "items", "order_date", "expected_date", "status", "total"]),
    "notifications": ("Notification", ["title", "message", "category", "read"]),
    "audit-logs": ("Audit Log", ["actor", "action", "entity", "entity_id", "details"]),
    "complaints": ("Complaint", ["customer_name", "job_id", "category", "description", "priority", "status", "resolution"]),
    "service-packages": ("Service Package", ["name", "description", "labour_cost", "parts_cost", "price", "duration_hours", "active"]),
    "time-logs": ("Labour Time Log", ["job_id", "employee_name", "task", "start_time", "end_time", "hours", "notes"]),
}

class ModuleRecord(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)

def _id_for(module: str) -> str:
    year = datetime.now().year
    key = f"module_{module}_{year}"
    counter = db.counters.find_one_and_update(
        {"_id": key}, {"$inc": {"sequence": 1}},
        upsert=True, return_document=ReturnDocument.AFTER
    )
    prefix = MODULES[module][0].upper().replace(" ", "")[:4]
    return f"{prefix}-{year}-{counter['sequence']:05d}"

@router.get("/api/modules")
def get_modules(user: Annotated[dict, Depends(get_current_user)]):
    return [
        {"key": key, "label": value[0], "fields": value[1], "access": module_access(user["role"], key)}
        for key, value in MODULES.items() if module_access(user["role"], key)
    ]

@router.get("/api/modules/{module}")
def list_module_records(module: str, user: Annotated[dict, Depends(get_current_user)]):
    if module not in MODULES:
        raise HTTPException(status_code=404, detail="Unknown Garage 21 module.")
    require_module(user, module)
    query = {"owner_id": user["id"]} if user["role"] == "customer" else {}
    records = db[module].find(query).sort("created_at", -1).limit(500)
    return [serialize_document(item) for item in records]

@router.post("/api/modules/{module}")
def create_module_record(module: str, record: ModuleRecord, user: Annotated[dict, Depends(get_current_user)]):
    if module not in MODULES:
        raise HTTPException(status_code=404, detail="Unknown Garage 21 module.")
    require_module(user, module, write=True)
    data = dict(record.data)
    if not data or not any(str(v).strip() for v in data.values() if v is not None):
        raise HTTPException(status_code=422, detail="Enter at least one field.")
    if module == "appointments" and data.get("date") and data.get("time_slot"):
        requested_status = str(data.get("status", "Booked")).strip().lower()
        if requested_status not in {"waitlist", "cancelled", "canceled"}:
            existing = db.appointments.find_one({
                "date": data["date"], "time_slot": data["time_slot"],
                "status": {"$nin": ["Cancelled", "Canceled", "Waitlist", "cancelled", "canceled", "waitlist"]}
            })
            if existing:
                raise HTTPException(status_code=409, detail="That appointment slot is already booked. Choose another slot or mark this booking as Waitlist.")
    now = datetime.now(timezone.utc)
    data.update({
        "record_id": _id_for(module),
        "created_at": now,
        "updated_at": now,
        "record_type": MODULES[module][0],
        "created_by": user["name"],
    })
    if user["role"] == "customer":
        data["owner_id"] = user["id"]  # customers only ever see their own records
    # Keep important calculations consistent for basic estimate/invoice workflows.
    if module == "estimates":
        labour = float(data.get("labour") or 0)
        parts = float(data.get("parts") or 0)
        tax_rate = float(data.get("tax_rate") or 0)
        data["total"] = round((labour + parts) * (1 + tax_rate / 100), 2)
    if module == "invoices":
        subtotal = float(data.get("subtotal") or 0)
        tax = float(data.get("tax") or 0)
        paid = float(data.get("paid") or 0)
        data["total"] = round(subtotal + tax, 2)
        data["balance"] = round(max(0, subtotal + tax - paid), 2)
        data["status"] = "Paid" if data["balance"] == 0 else ("Partially Paid" if paid > 0 else "Unpaid")
    if module == "inventory":
        data["quantity"] = int(data.get("quantity") or 0)
        data["reorder_level"] = int(data.get("reorder_level") or 0)
        data["low_stock"] = data["quantity"] <= data["reorder_level"]
    db[module].insert_one(data)
    # Create a notification for key workflow events.
    if module in {"appointments", "invoices", "inventory", "quality-control", "feedback"}:
        title = {
            "appointments": "Appointment created",
            "invoices": "Invoice recorded",
            "inventory": "Inventory updated",
            "quality-control": "Quality check recorded",
            "feedback": "Customer feedback received",
        }[module]
        db.notifications.insert_one({
            "record_id": _id_for("notifications"), "title": title,
            "message": f"{MODULES[module][0]} record {data['record_id']} was created.",
            "category": module, "read": False, "created_at": now
        })
    # Lightweight audit entry for traceability.
    if module != "audit-logs":
        db["audit-logs"].insert_one({
            "record_id": _id_for("audit-logs"), "actor": f"{user['name']} ({user['role']})",
            "action": "CREATE", "entity": MODULES[module][0],
            "entity_id": data["record_id"], "details": "Created through Garage 21",
            "created_at": now
        })
    return serialize_document(db[module].find_one({"record_id": data["record_id"]}))

@router.patch("/api/modules/{module}/{record_id}")
def update_module_record(module: str, record_id: str, record: ModuleRecord, user: Annotated[dict, Depends(get_current_user)]):
    if module not in MODULES:
        raise HTTPException(status_code=404, detail="Unknown Garage 21 module.")
    require_module(user, module, write=True)
    data = dict(record.data)
    for protected in ("owner_id", "record_id", "created_by", "created_at"):
        data.pop(protected, None)
    data["updated_at"] = datetime.now(timezone.utc)
    match = {"record_id": record_id}
    if user["role"] == "customer":
        match["owner_id"] = user["id"]
    updated = db[module].find_one_and_update(
        match, {"$set": data}, return_document=ReturnDocument.AFTER
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Record not found.")
    return serialize_document(updated)

@router.get("/api/reports/summary")
def report_summary(user: Annotated[dict, Depends(get_current_user)]):
    require_roles(user, "admin")
    customers = db.customers.count_documents({})
    vehicles = db.vehicles.count_documents({})
    jobs = list(db.service_jobs.find({}, {"status": 1, "estimated_cost": 1}))
    active = sum(1 for j in jobs if j.get("status") != "Delivered")
    revenue = 0.0
    for inv in db.invoices.find({}, {"paid": 1}):
        revenue += float(inv.get("paid") or 0)
    outstanding = 0.0
    for inv in db.invoices.find({}, {"balance": 1}):
        outstanding += float(inv.get("balance") or 0)
    low_stock = db.inventory.count_documents({"low_stock": True})
    return {
        "customers": customers, "vehicles": vehicles, "jobs": len(jobs),
        "active_jobs": active, "revenue_collected": round(revenue, 2),
        "outstanding_balance": round(outstanding, 2), "low_stock_items": low_stock,
        "appointments": db.appointments.count_documents({}),
        "unread_notifications": db.notifications.count_documents({"read": False}),
    }

@router.post("/api/ai/assistant")
def local_ai_assistant(payload: dict[str, Any], user: Annotated[dict, Depends(get_current_user)]):
    require_roles(user, "admin", "mechanic")
    prompt = str(payload.get("prompt", "")).strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="Enter a question for the assistant.")
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
    model = os.getenv("OLLAMA_MODEL", "llama3.2")
    body = json_bytes = __import__("json").dumps({
        "model": model,
        "prompt": "You are a garage workshop assistant. Be clear and safety-conscious. Do not invent vehicle diagnosis; ask a mechanic to verify estimates and safety-critical recommendations. User question: " + prompt,
        "stream": False
    }).encode("utf-8")
    request = urllib.request.Request(ollama_url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            result = __import__("json").loads(response.read().decode("utf-8"))
        return {"reply": result.get("response", "No response returned."), "model": model, "local": True}
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Local Ollama is not reachable. Start Ollama and make sure the model 'llama3.2' is installed. Details: " + str(exc))
