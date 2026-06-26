"""FastAPI app + Socket.IO mount -- main entry point."""

import random
import string
from datetime import datetime
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_instructor,
)
from database import (
    init_db,
    users_collection,
    sessions_collection,
    monitor_state_collection,
)
from models import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    DEFAULT_MONITOR_STATE,
    PARAMETER_SPEC,
)
from socket_manager import sio, emit_session_ended


# ── Lifespan ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Seed default users if none exist
    if await users_collection.count_documents({}) == 0:
        await users_collection.insert_many([
            {
                "username": "instructor",
                "password_hash": hash_password("instructor123"),
                "role": "instructor",
                "created_at": datetime.utcnow(),
            },
            {
                "username": "student",
                "password_hash": hash_password("student123"),
                "role": "student",
                "created_at": datetime.utcnow(),
            },
        ])
        print("[INIT] Seeded default users: instructor / student")
    yield


# ── App Setup ─────────────────────────────────────────────────────

api_app = FastAPI(title="AI Simulation Monitor", lifespan=lifespan)

api_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth Routes ───────────────────────────────────────────────────

@api_app.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    user = await users_collection.find_one({"username": body.username})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({
        "sub": user["username"],
        "role": user["role"],
    })

    session_code = None
    if user["role"] == "instructor":
        session = await sessions_collection.find_one({
            "created_by": user["_id"],
            "is_active": True,
        })
        if session:
            session_code = session["session_code"]

    return TokenResponse(
        access_token=token,
        role=user["role"],
        session_code=session_code,
    )


@api_app.post("/auth/register")
async def register(body: RegisterRequest, user: dict = Depends(require_instructor)):
    existing = await users_collection.find_one({"username": body.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    await users_collection.insert_one({
        "username": body.username,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "created_at": datetime.utcnow(),
    })
    return {"message": f"User '{body.username}' created with role '{body.role}'"}


# ── Meta Routes ───────────────────────────────────────────────────

@api_app.get("/meta/parameter-spec")
async def get_parameter_spec():
    """Return parameter spec — drives every frontend control dynamically."""
    return PARAMETER_SPEC


# ── Session Routes ────────────────────────────────────────────────

def _generate_code(length=6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


@api_app.post("/session/create")
async def create_session(user: dict = Depends(require_instructor)):
    existing = await sessions_collection.find_one({
        "created_by": user["_id"],
        "is_active": True,
    })
    if existing:
        return {
            "session_code": existing["session_code"],
            "message": "Existing active session returned",
        }

    code = _generate_code()
    session_doc = {
        "session_code": code,
        "created_by": user["_id"],
        "started_at": datetime.utcnow(),
        "ended_at": None,
        "is_active": True,
        "event_log": [
            {"timestamp": datetime.utcnow().isoformat(), "event": "Session created"},
        ],
        "history": [],
    }
    result = await sessions_collection.insert_one(session_doc)

    state = dict(DEFAULT_MONITOR_STATE)
    state["session_id"] = result.inserted_id
    state["last_updated"] = datetime.utcnow().isoformat()
    state["updated_by"] = user["username"]
    await monitor_state_collection.insert_one(state)

    return {"session_code": code, "message": "New session created"}


@api_app.get("/session/{session_code}/state")
async def get_session_state(session_code: str, user: dict = Depends(get_current_user)):
    session = await sessions_collection.find_one({"session_code": session_code})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    state = await monitor_state_collection.find_one(
        {"session_id": session["_id"]},
        {"_id": 0, "session_id": 0},
    )
    if not state:
        raise HTTPException(status_code=404, detail="Monitor state not found")

    state["started_at"] = session.get("started_at", datetime.utcnow()).isoformat()
    return state


@api_app.get("/session/{session_code}/log")
async def get_session_log(session_code: str, user: dict = Depends(get_current_user)):
    session = await sessions_collection.find_one({"session_code": session_code})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"event_log": session.get("event_log", [])}


@api_app.get("/session/{session_code}/history")
async def get_session_history(
    session_code: str,
    since: str = Query(None),
    limit: int = Query(300),
    user: dict = Depends(get_current_user),
):
    """Return numeric vital history for trend graphing."""
    session = await sessions_collection.find_one({"session_code": session_code})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    history = session.get("history", [])
    if since:
        history = [h for h in history if h.get("timestamp", "") > since]
    return {"history": history[-limit:]}


@api_app.post("/session/{session_code}/end")
async def end_session(session_code: str, user: dict = Depends(require_instructor)):
    session = await sessions_collection.find_one({"session_code": session_code})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await sessions_collection.update_one(
        {"_id": session["_id"]},
        {"$set": {
            "is_active": False,
            "ended_at": datetime.utcnow(),
        }},
    )

    # Emit session_ended to all connected clients
    await emit_session_ended(session_code)

    return {"message": "Session ended"}


# ── Mount Socket.IO onto ASGI ─────────────────────────────────────

app = socketio.ASGIApp(sio, other_asgi_app=api_app)
