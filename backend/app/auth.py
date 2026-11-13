import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
import secrets
import smtplib
from email.message import EmailMessage
from pwdlib import PasswordHash
from pymongo.errors import DuplicateKeyError

from app.database import db
from app.permissions import ROLE_PAGES, ROLE_LABELS
from app.roles import create_role_profile

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
JWT_SECRET = os.getenv("JWT_SECRET", "CHANGE_THIS_DEVELOPMENT_SECRET_BEFORE_DEPLOYING")
JWT_ALGORITHM = "HS256"
TOKEN_MINUTES = int(os.getenv("JWT_TOKEN_MINUTES", "480"))


class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: str = Field(default="", max_length=15)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordInput(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


def make_token(user_id: str, email: str, version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user_id, "email": email, "ver": version, "iat": now, "exp": now + timedelta(minutes=TOKEN_MINUTES)}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def public_user(user: dict) -> dict:
    role = user.get("role", "admin")
    return {
        "id": str(user["_id"]), "name": user["name"], "email": user["email"],
        "role": role, "role_label": ROLE_LABELS.get(role, role.title()),
        "customer_id": user.get("customer_id"), "allowed_pages": ROLE_PAGES.get(role, []),
    }


def get_current_user(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please log in to continue.")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = db.users.find_one({"_id": __import__("bson").ObjectId(payload["sub"])})
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session has expired. Please log in again.")
    if user and user.get("active", True) is False:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This account has been deactivated. Contact an administrator.")
    if not user or int(user.get("token_version", 0)) != int(payload.get("ver", 0)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session is no longer valid. Please log in again.")
    return public_user(user)


@router.post("/register", status_code=201)
def register(payload: RegisterInput):
    email = payload.email.lower().strip()
    if db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    # Public sign-up always creates a customer. Staff and admin accounts are created by an admin.
    user = {"name": payload.name.strip(), "email": email, "password_hash": password_hash.hash(payload.password), "role": "customer", "active": True, "created_at": datetime.now(timezone.utc)}
    try:
        result = db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user["_id"] = result.inserted_id
    create_role_profile(user, "customer", payload.phone.strip())
    user = db.users.find_one({"_id": result.inserted_id})
    return {"access_token": make_token(str(result.inserted_id), email), "token_type": "bearer", "user": public_user(user)}


@router.post("/login")
def login(payload: LoginInput):
    email = payload.email.lower().strip()
    user = db.users.find_one({"email": email})
    if not user or not password_hash.verify(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    if user.get("active", True) is False:
        raise HTTPException(status_code=403, detail="This account has been deactivated. Contact an administrator.")
    return {"access_token": make_token(str(user["_id"]), email, int(user.get("token_version", 0))), "token_type": "bearer", "user": public_user(user)}


@router.get("/me")
def me(user: Annotated[dict, Depends(get_current_user)]):
    return user



def _send_reset_email(email: str, token: str):
    """Send a one-time reset link if SMTP settings are configured."""
    host, sender = os.getenv("SMTP_HOST"), os.getenv("SMTP_FROM")
    if not host or not sender:
        return
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    msg = EmailMessage()
    msg["Subject"] = "Garage 21 password reset"
    msg["From"] = sender
    msg["To"] = email
    msg.set_content("A password reset was requested for your Garage 21 account. The link expires in 20 minutes:\n\n" + f"{frontend_url}/?reset_token={token}" + "\n\nIgnore this message if you did not request it.")
    with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=10) as smtp:
        smtp.starttls()
        username, password = os.getenv("SMTP_USERNAME"), os.getenv("SMTP_PASSWORD")
        if username and password:
            smtp.login(username, password)
        smtp.send_message(msg)


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordInput):
    email = payload.email.lower().strip()
    user = db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        db.users.update_one({"_id": user["_id"]}, {"$set": {
            "password_reset_token": token,
            "password_reset_expires": (datetime.now(timezone.utc) + timedelta(minutes=20)).timestamp()
        }})
        try:
            _send_reset_email(email, token)
        except Exception:
            pass
    return {"message": "If that email is registered, password reset instructions will be sent."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordInput):
    user = db.users.find_one({"password_reset_token": payload.token, "password_reset_expires": {"$gt": datetime.now(timezone.utc).timestamp()}})
    if not user:
        raise HTTPException(status_code=400, detail="The reset link is invalid or has expired. Request a new one.")
    db.users.update_one({"_id": user["_id"]}, {"$set": {
        "password_hash": password_hash.hash(payload.new_password),
        "token_version": int(user.get("token_version", 0)) + 1
    }, "$unset": {"password_reset_token": "", "password_reset_expires": ""}})
    return {"message": "Password changed successfully. Please log in with your new password."}


@router.post("/change-password")
def change_password(payload: ChangePasswordInput, user_data: Annotated[dict, Depends(get_current_user)]):
    from bson import ObjectId
    user = db.users.find_one({"_id": ObjectId(user_data["id"])})
    if not user or not password_hash.verify(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    version = int(user.get("token_version", 0)) + 1
    db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": password_hash.hash(payload.new_password), "token_version": version}})
    return {"message": "Password changed. Please log in again."}
