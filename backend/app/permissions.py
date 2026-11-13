"""Role-based access rules for Garage 21.

Four roles:
  admin     - everything, plus user and role management
  customer  - own profile, own vehicles, own job status, own appointments/feedback/complaints
  mechanic  - working pages only: job cards, inspections, quality control, labour time, parts (read)
  employee  - staff pages only: staff directory, attendance, leave requests
"""
from fastapi import HTTPException

ROLES = ("admin", "customer", "mechanic", "employee")

ROLE_LABELS = {"admin": "Admin", "customer": "Customer", "mechanic": "Mechanic", "employee": "Employee"}

# One MongoDB collection per role, holding that role's profile documents.
ROLE_COLLECTIONS = {
    "admin": "admin_profiles",
    "customer": "customer_profiles",
    "mechanic": "mechanic_profiles",
    "employee": "employee_profiles",
}

# Frontend page keys each role may open. "*" means every page.
ROLE_PAGES = {
    "admin": ["*"],
    "customer": ["Customers", "Vehicles", "QR Tracking", "appointments", "feedback", "complaints"],
    "mechanic": ["Service Jobs", "inspections", "quality-control", "time-logs", "inventory", "AI Assistant"],
    "employee": ["employees", "attendance", "leave"],
}

# Workshop module access: "r" read only, "rw" read and write.
# Customer access to modules is limited to the customer's own records.
ROLE_MODULES = {
    "customer": {"appointments": "rw", "feedback": "rw", "complaints": "rw"},
    "mechanic": {"inspections": "rw", "quality-control": "rw", "time-logs": "rw", "inventory": "r"},
    "employee": {"employees": "rw", "attendance": "rw", "leave": "rw"},
}


def module_access(role: str, module: str) -> str:
    """Return "", "r" or "rw"."""
    if role == "admin":
        return "rw"
    return ROLE_MODULES.get(role, {}).get(module, "")


def require_module(user: dict, module: str, write: bool = False) -> None:
    access = module_access(user["role"], module)
    if not access or (write and access != "rw"):
        raise HTTPException(status_code=403, detail="Your role does not have access to this section.")


def require_roles(user: dict, *roles: str) -> None:
    if user["role"] not in roles:
        raise HTTPException(status_code=403, detail="Your role does not have access to this section.")
