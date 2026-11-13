
from typing import Optional

from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=10, max_length=15)
    email: Optional[str] = None
    address: Optional[str] = None


class VehicleCreate(BaseModel):
    customer_id: str
    registration_number: str = Field(min_length=3)
    make: str
    model: str
    year: Optional[int] = None
    odometer: int = Field(default=0, ge=0)
    vin: Optional[str] = None
    insurance_expiry: Optional[str] = None


class ServiceJobCreate(BaseModel):
    customer_id: str
    vehicle_id: str
    complaint: str = Field(min_length=3)
    estimated_cost: float = Field(default=0, ge=0)
    mechanic_name: Optional[str] = None
