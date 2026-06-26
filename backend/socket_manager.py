"""Socket.IO server and event handlers — matches frozen contract."""

import asyncio
import math
from datetime import datetime

import socketio
from auth import decode_token
from database import monitor_state_collection, sessions_collection
from models import DEFAULT_MONITOR_STATE

# Create async Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

# Track active transfer tasks: { (session_id, field): asyncio.Task }
_transfer_tasks: dict = {}


def compute_alarms(state: dict) -> list[str]:
    """Compute alarms by checking values against alarm_thresholds."""
    alarms = []
    thresholds = state.get("alarm_thresholds", {})

    for field, bounds in thresholds.items():
        val = state.get(field)
        if val is None:
            continue
        low = bounds.get("low")
        high = bounds.get("high")
        if low is not None and val < low:
            alarms.append(f"{field} LOW")
        if high is not None and val > high:
            alarms.append(f"{field} HIGH")

    # Special named alarms
    if state.get("avRR", 14) == 0:
        alarms.append("APNEA")
    if state.get("SpO2", 98) < 90:
        alarms.append("DESAT")

    return alarms


# ── Socket Events ─────────────────────────────────────────────────

@sio.event
async def connect(sid, environ):
    print(f"[SIO] Client connected: {sid}")


@sio.event
async def disconnect(sid):
    print(f"[SIO] Client disconnected: {sid}")


@sio.event
async def join_session(sid, data):
    """Client joins a session room."""
    session_code = data.get("session_code")
    token = data.get("token")
    if not session_code or not token:
        await sio.emit("error", {"message": "Missing session_code or token"}, to=sid)
        return

    try:
        payload = decode_token(token)
    except Exception:
        await sio.emit("error", {"message": "Invalid token"}, to=sid)
        return

    session = await sessions_collection.find_one({"session_code": session_code})
    if not session:
        await sio.emit("error", {"message": "Session not found"}, to=sid)
        return

    sio.enter_room(sid, session_code)
    await sio.save_session(sid, {
        "username": payload.get("sub"),
        "role": payload.get("role"),
        "session_code": session_code,
    })

    # Send current state with started_at
    state = await monitor_state_collection.find_one(
        {"session_id": session["_id"]},
        {"_id": 0, "session_id": 0},
    )
    if state:
        state["started_at"] = session.get("started_at", datetime.utcnow()).isoformat()
        await sio.emit("state_update", state, to=sid)

    print(f"[SIO] {payload.get('sub')} joined session {session_code}")


@sio.event
async def update_parameter(sid, data):
    """Instructor updates a single parameter.
    Contract: {field, value, transfer_time_seconds, transfer_function}
    """
    session_data = await sio.get_session(sid)
    if not session_data or session_data.get("role") != "instructor":
        await sio.emit("error", {"message": "Instructor role required"}, to=sid)
        return

    session_code = session_data.get("session_code")
    field = data.get("field")
    value = data.get("value")
    transfer_seconds = data.get("transfer_time_seconds", 0)
    transfer_fn = data.get("transfer_function", "immediate")

    if not field:
        await sio.emit("error", {"message": "Missing field"}, to=sid)
        return

    session = await sessions_collection.find_one({"session_code": session_code})
    if not session:
        return

    if transfer_seconds and transfer_seconds > 0:
        await _start_transfer(
            session, session_code, field, value,
            transfer_seconds, transfer_fn, session_data.get("username", "")
        )
    else:
        await _apply_update(session, session_code, field, value, session_data.get("username", ""))


@sio.event
async def update_rhythm(sid, data):
    """Instructor updates cardiac rhythm settings.
    Contract: {rhythm, extrasystole, HR, ecg_lead,
               artifact_electrical, artifact_muscular, emd_pea}
    """
    session_data = await sio.get_session(sid)
    if not session_data or session_data.get("role") != "instructor":
        await sio.emit("error", {"message": "Instructor role required"}, to=sid)
        return

    session_code = session_data.get("session_code")
    session = await sessions_collection.find_one({"session_code": session_code})
    if not session:
        return

    update_fields = {}
    for key in ["rhythm", "extrasystole", "HR", "ecg_lead",
                "artifact_electrical", "artifact_muscular", "emd_pea"]:
        if key in data:
            update_fields[key] = data[key]

    # Keep pulse_rate in sync with HR
    if "HR" in update_fields:
        update_fields["pulse_rate"] = update_fields["HR"]

    update_fields["last_updated"] = datetime.utcnow().isoformat()
    update_fields["updated_by"] = session_data.get("username", "")

    await monitor_state_collection.update_one(
        {"session_id": session["_id"]},
        {"$set": update_fields},
    )

    state = await _get_state_with_alarms(session)
    state["started_at"] = session.get("started_at", datetime.utcnow()).isoformat()
    await sio.emit("state_update", state, room=session_code)
    await sio.emit("rhythm_change", {
        k: state.get(k) for k in
        ["rhythm", "extrasystole", "HR", "ecg_lead",
         "artifact_electrical", "artifact_muscular", "emd_pea"]
    }, room=session_code)

    await sessions_collection.update_one(
        {"_id": session["_id"]},
        {"$push": {"event_log": {
            "timestamp": datetime.utcnow().isoformat(),
            "event": f"Rhythm -> {state.get('rhythm')}, HR -> {state.get('HR')}",
        }}},
    )


@sio.event
async def update_eyes(sid, data):
    """Instructor updates eyes state."""
    session_data = await sio.get_session(sid)
    if not session_data or session_data.get("role") != "instructor":
        await sio.emit("error", {"message": "Instructor role required"}, to=sid)
        return

    session_code = session_data.get("session_code")
    session = await sessions_collection.find_one({"session_code": session_code})
    if not session:
        return

    update_fields = {}
    if "eyes_state" in data:
        update_fields["eyes_state"] = data["eyes_state"]
    if "eyes_look" in data:
        update_fields["eyes_look"] = data["eyes_look"]

    update_fields["last_updated"] = datetime.utcnow().isoformat()
    await monitor_state_collection.update_one(
        {"session_id": session["_id"]},
        {"$set": update_fields},
    )

    state = await _get_state_with_alarms(session)
    state["started_at"] = session.get("started_at", datetime.utcnow()).isoformat()
    await sio.emit("state_update", state, room=session_code)


@sio.event
async def add_event_log(sid, data):
    """Add an event to the session log."""
    session_data = await sio.get_session(sid)
    if not session_data or session_data.get("role") != "instructor":
        await sio.emit("error", {"message": "Instructor role required"}, to=sid)
        return

    session_code = session_data.get("session_code")
    event_text = data.get("event", "")
    session = await sessions_collection.find_one({"session_code": session_code})
    if not session:
        return

    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "event": event_text,
    }
    await sessions_collection.update_one(
        {"_id": session["_id"]},
        {"$push": {"event_log": entry}},
    )
    await sio.emit("session_event", entry, room=session_code)


@sio.event
async def update_alarm_thresholds(sid, data):
    """Instructor updates alarm thresholds.
    Contract: {thresholds: {"HR": {"low": 50, "high": 120}, ...}}
    """
    session_data = await sio.get_session(sid)
    if not session_data or session_data.get("role") != "instructor":
        await sio.emit("error", {"message": "Instructor role required"}, to=sid)
        return

    session_code = session_data.get("session_code")
    session = await sessions_collection.find_one({"session_code": session_code})
    if not session:
        return

    new_thresholds = data.get("thresholds", {})
    await monitor_state_collection.update_one(
        {"session_id": session["_id"]},
        {"$set": {"alarm_thresholds": new_thresholds}},
    )

    state = await _get_state_with_alarms(session)
    state["started_at"] = session.get("started_at", datetime.utcnow()).isoformat()
    await sio.emit("state_update", state, room=session_code)
    await sio.emit("alarm_update", {"alarms": state["alarms"]}, room=session_code)


# ── Helpers ───────────────────────────────────────────────────────

async def _get_state_with_alarms(session) -> dict:
    """Fetch state, recompute alarms, persist, return."""
    state = await monitor_state_collection.find_one(
        {"session_id": session["_id"]},
        {"_id": 0, "session_id": 0},
    )
    state["alarms"] = compute_alarms(state)
    await monitor_state_collection.update_one(
        {"session_id": session["_id"]},
        {"$set": {"alarms": state["alarms"]}},
    )
    return state


async def _apply_update(session, session_code, field, value, username):
    """Apply a single field update, recompute alarms, broadcast."""
    set_fields = {
        field: value,
        "last_updated": datetime.utcnow().isoformat(),
        "updated_by": username,
    }
    # Keep derived fields in sync
    if field == "HR":
        set_fields["pulse_rate"] = value
    if field == "ABP_sys" or field == "ABP_dia":
        # Recalculate MAP when either changes
        current = await monitor_state_collection.find_one({"session_id": session["_id"]})
        sys_val = value if field == "ABP_sys" else current.get("ABP_sys", 120)
        dia_val = value if field == "ABP_dia" else current.get("ABP_dia", 80)
        set_fields["MAP"] = round(dia_val + (sys_val - dia_val) / 3, 1)
    if field == "NBP_sys" or field == "NBP_dia":
        current = await monitor_state_collection.find_one({"session_id": session["_id"]})
        sys_val = value if field == "NBP_sys" else current.get("NBP_sys", 120)
        dia_val = value if field == "NBP_dia" else current.get("NBP_dia", 80)
        set_fields["NBP_mean"] = round(dia_val + (sys_val - dia_val) / 3, 1)
    if field == "PAP_sys" or field == "PAP_dia":
        current = await monitor_state_collection.find_one({"session_id": session["_id"]})
        sys_val = value if field == "PAP_sys" else current.get("PAP_sys", 20)
        dia_val = value if field == "PAP_dia" else current.get("PAP_dia", 10)
        set_fields["PAP_mean"] = round(dia_val + (sys_val - dia_val) / 3, 1)

    await monitor_state_collection.update_one(
        {"session_id": session["_id"]},
        {"$set": set_fields},
    )

    state = await _get_state_with_alarms(session)
    state["started_at"] = session.get("started_at", datetime.utcnow()).isoformat()
    await sio.emit("state_update", state, room=session_code)
    await sio.emit("alarm_update", {"alarms": state["alarms"]}, room=session_code)

    await sessions_collection.update_one(
        {"_id": session["_id"]},
        {"$push": {"event_log": {
            "timestamp": datetime.utcnow().isoformat(),
            "event": f"{field} -> {value}",
        }}},
    )


async def _start_transfer(session, session_code, field, target_value,
                           transfer_seconds, transfer_fn, username):
    """Background interpolation: linear or smooth (ease-in-out)."""
    task_key = (str(session["_id"]), field)

    if task_key in _transfer_tasks:
        _transfer_tasks[task_key].cancel()

    current = await monitor_state_collection.find_one({"session_id": session["_id"]})
    start_value = current.get(field, 0)
    steps = max(int(transfer_seconds), 1)

    async def _interpolate():
        try:
            for i in range(1, steps + 1):
                await asyncio.sleep(1)
                t = i / steps  # 0..1
                if transfer_fn == "smooth":
                    # Ease-in-out (smoothstep)
                    t = t * t * (3 - 2 * t)
                # linear is just t
                val = start_value + (target_value - start_value) * t
                val = round(val, 1)
                await _apply_update(session, session_code, field, val, username)
            await _apply_update(session, session_code, field, target_value, username)
        except asyncio.CancelledError:
            pass
        finally:
            _transfer_tasks.pop(task_key, None)

    task = asyncio.create_task(_interpolate())
    _transfer_tasks[task_key] = task


async def emit_session_ended(session_code: str):
    """Emit session_ended to all clients in the room."""
    await sio.emit("session_ended", {"session_code": session_code}, room=session_code)
