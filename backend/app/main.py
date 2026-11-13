
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware

from app.database import initialize_database
from app.roles import bootstrap_roles
from app.routers import customers, vehicles, service_jobs, modules, users
from app.auth import router as auth_router, get_current_user, JWT_SECRET, JWT_ALGORITHM
import jwt
from bson import ObjectId
from app.database import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    bootstrap_roles()
    yield


app = FastAPI(
    title="Garage 21 API",
    description="Garage management and service tracking",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(auth_router)
# All workshop data APIs require a valid bearer token.
app.include_router(customers.router, dependencies=[Depends(get_current_user)])
app.include_router(vehicles.router, dependencies=[Depends(get_current_user)])
app.include_router(service_jobs.router, dependencies=[Depends(get_current_user)])
app.include_router(modules.router, dependencies=[Depends(get_current_user)])
app.include_router(users.router)


@app.get("/")
def home():
    return {
        "message": "Welcome to Garage 21",
        "status": "running",
        "documentation": "/docs"
    }


@app.get("/health")
def health():
    from app.database import client

    client.admin.command("ping")
    return {"status": "healthy", "database": "connected"}


class ConnectionManager:
    def __init__(self):
        self.connections = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.connections.discard(websocket)

    async def broadcast(self, message: dict):
        disconnected = []

        for connection in list(self.connections):
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)

        for connection in disconnected:
            self.disconnect(connection)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default="")):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if not db.users.find_one({"_id": ObjectId(payload["sub"])}):
            raise ValueError("Unknown user")
    except Exception:
        await websocket.close(code=1008, reason="Authentication required")
        return
    await manager.connect(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
