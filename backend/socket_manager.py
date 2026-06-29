"""Socket.IO server and event handlers — matches frozen contract."""

import asyncio
import math
import json
from datetime import datetime

import socketio
import aiomysql
from auth import decode_token
from database import get_db_pool
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

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT id, started_at FROM sessions WHERE session_code = %s", (session_code,))
            session = await cur.fetchone()
            
            if not session:
                await sio.emit("error", {"message": "Session not found"}, to=sid)
                return

            await sio.enter_room(sid, session_code)
            await sio.save_session(sid, {
                "username": payload.get("sub"),
                "role": payload.get("role"),
                "session_code": session_code,
            })

            # Send current state with started_at
            await cur.execute("SELECT state_data FROM monitor_state WHERE session_id = %s", (session["id"],))
            state_row = await cur.fetchone()
            
            if state_row:
                state = json.loads(state_row["state_data"])
                state["started_at"] = session["started_at"].isoformat() if session["started_at"] else datetime.utcnow().isoformat()
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

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT id FROM sessions WHERE session_code = %s", (session_code,))
            session = await cur.fetchone()
            if not session:
                return

    if transfer_seconds and transfer_seconds > 0 and transfer_fn in ("linear", "smooth"):
        print(f"[TRANSFER] Starting {transfer_fn} transfer: {field} -> {value} over {transfer_seconds}s")
        await _start_transfer(
            session, session_code, field, value,
            transfer_seconds, transfer_fn, session_data.get("username", "")
        )
    else:
        print(f"[UPDATE] Instant: {field} -> {value}")
        await _apply_update(session, session_code, field, value, session_data.get("username", ""))


@sio.event
async def update_rhythm(sid, data):
    """Instructor updates cardiac rhythm settings."""
    session_data = await sio.get_session(sid)
    if not session_data or session_data.get("role") != "instructor":
        await sio.emit("error", {"message": "Instructor role required"}, to=sid)
        return

    session_code = session_data.get("session_code")
    
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT id, started_at, event_log FROM sessions WHERE session_code = %s", (session_code,))
            session = await cur.fetchone()
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

            await cur.execute("SELECT state_data FROM monitor_state WHERE session_id = %s", (session["id"],))
            state_row = await cur.fetchone()
            state = json.loads(state_row["state_data"])
            
            for k, v in update_fields.items():
                state[k] = v
                
            state["alarms"] = compute_alarms(state)
            
            await cur.execute("UPDATE monitor_state SET state_data = %s WHERE session_id = %s", (json.dumps(state), session["id"]))
            
            event_log = json.loads(session["event_log"]) if session["event_log"] else []
            event_log.append({
                "timestamp": datetime.utcnow().isoformat(),
                "event": f"Rhythm -> {state.get('rhythm')}, HR -> {state.get('HR')}",
            })
            await cur.execute("UPDATE sessions SET event_log = %s WHERE id = %s", (json.dumps(event_log), session["id"]))
            
            state["started_at"] = session["started_at"].isoformat() if session["started_at"] else datetime.utcnow().isoformat()
            
    await sio.emit("state_update", state, room=session_code)
    await sio.emit("rhythm_change", {
        k: state.get(k) for k in
        ["rhythm", "extrasystole", "HR", "ecg_lead",
         "artifact_electrical", "artifact_muscular", "emd_pea"]
    }, room=session_code)


@sio.event
async def update_eyes(sid, data):
    """Instructor updates eyes state."""
    session_data = await sio.get_session(sid)
    if not session_data or session_data.get("role") != "instructor":
        await sio.emit("error", {"message": "Instructor role required"}, to=sid)
        return

    session_code = session_data.get("session_code")
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT id, started_at FROM sessions WHERE session_code = %s", (session_code,))
            session = await cur.fetchone()
            if not session:
                return

            update_fields = {}
            if "eyes_state" in data:
                update_fields["eyes_state"] = data["eyes_state"]
            if "eyes_look" in data:
                update_fields["eyes_look"] = data["eyes_look"]

            update_fields["last_updated"] = datetime.utcnow().isoformat()
            
            await cur.execute("SELECT state_data FROM monitor_state WHERE session_id = %s", (session["id"],))
            state_row = await cur.fetchone()
            state = json.loads(state_row["state_data"])
            
            for k, v in update_fields.items():
                state[k] = v
                
            state["alarms"] = compute_alarms(state)
            await cur.execute("UPDATE monitor_state SET state_data = %s WHERE session_id = %s", (json.dumps(state), session["id"]))
            
            state["started_at"] = session["started_at"].isoformat() if session["started_at"] else datetime.utcnow().isoformat()

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
    
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT id, event_log FROM sessions WHERE session_code = %s", (session_code,))
            session = await cur.fetchone()
            if not session:
                return

            event_log = json.loads(session["event_log"]) if session["event_log"] else []
            entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "event": event_text,
            }
            event_log.append(entry)
            
            await cur.execute("UPDATE sessions SET event_log = %s WHERE id = %s", (json.dumps(event_log), session["id"]))
            
    await sio.emit("session_event", entry, room=session_code)


@sio.event
async def update_alarm_thresholds(sid, data):
    """Instructor updates alarm thresholds."""
    session_data = await sio.get_session(sid)
    if not session_data or session_data.get("role") != "instructor":
        await sio.emit("error", {"message": "Instructor role required"}, to=sid)
        return

    session_code = session_data.get("session_code")
    
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT id, started_at FROM sessions WHERE session_code = %s", (session_code,))
            session = await cur.fetchone()
            if not session:
                return

            new_thresholds = data.get("thresholds", {})
            
            await cur.execute("SELECT state_data FROM monitor_state WHERE session_id = %s", (session["id"],))
            state_row = await cur.fetchone()
            state = json.loads(state_row["state_data"])
            
            state["alarm_thresholds"] = new_thresholds
            state["alarms"] = compute_alarms(state)
            
            await cur.execute("UPDATE monitor_state SET state_data = %s WHERE session_id = %s", (json.dumps(state), session["id"]))
            
            state["started_at"] = session["started_at"].isoformat() if session["started_at"] else datetime.utcnow().isoformat()

    await sio.emit("state_update", state, room=session_code)
    await sio.emit("alarm_update", {"alarms": state["alarms"]}, room=session_code)


# ── Helpers ───────────────────────────────────────────────────────

async def _apply_update(session, session_code, field, value, username):
    """Apply a single field update, recompute alarms, broadcast."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT state_data FROM monitor_state WHERE session_id = %s", (session["id"],))
            state_row = await cur.fetchone()
            state = json.loads(state_row["state_data"])

            state[field] = value
            state["last_updated"] = datetime.utcnow().isoformat()
            state["updated_by"] = username

            # Keep derived fields in sync
            if field == "HR":
                state["pulse_rate"] = value
            if field in ("ABP_sys", "ABP_dia"):
                sys_val = state.get("ABP_sys", 120)
                dia_val = state.get("ABP_dia", 80)
                state["MAP"] = round(dia_val + (sys_val - dia_val) / 3, 1)
            if field in ("NBP_sys", "NBP_dia"):
                sys_val = state.get("NBP_sys", 120)
                dia_val = state.get("NBP_dia", 80)
                state["NBP_mean"] = round(dia_val + (sys_val - dia_val) / 3, 1)
            if field in ("PAP_sys", "PAP_dia"):
                sys_val = state.get("PAP_sys", 20)
                dia_val = state.get("PAP_dia", 10)
                state["PAP_mean"] = round(dia_val + (sys_val - dia_val) / 3, 1)

            state["alarms"] = compute_alarms(state)
            await cur.execute("UPDATE monitor_state SET state_data = %s WHERE session_id = %s", (json.dumps(state), session["id"]))

            await cur.execute("SELECT started_at, event_log FROM sessions WHERE id = %s", (session["id"],))
            sess_row = await cur.fetchone()
            
            event_log = json.loads(sess_row["event_log"]) if sess_row["event_log"] else []
            event_log.append({
                "timestamp": datetime.utcnow().isoformat(),
                "event": f"{field} -> {value}",
            })
            await cur.execute("UPDATE sessions SET event_log = %s WHERE id = %s", (json.dumps(event_log), session["id"]))
            
            state["started_at"] = sess_row["started_at"].isoformat() if sess_row["started_at"] else datetime.utcnow().isoformat()

    await sio.emit("state_update", state, room=session_code)
    await sio.emit("alarm_update", {"alarms": state["alarms"]}, room=session_code)


async def _start_transfer(session, session_code, field, target_value,
                           transfer_seconds, transfer_fn, username):
    """Background interpolation: linear or smooth (ease-in-out)."""
    task_key = (str(session["id"]), field)

    if task_key in _transfer_tasks:
        _transfer_tasks[task_key].cancel()

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT state_data FROM monitor_state WHERE session_id = %s", (session["id"],))
            state_row = await cur.fetchone()
            state = json.loads(state_row["state_data"])
            
    start_value = state.get(field, 0)
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
                print(f"[TRANSFER] {field}: step {i}/{steps} = {val}")
                await _apply_update(session, session_code, field, val, username)
            # Final exact value
            await _apply_update(session, session_code, field, target_value, username)
            print(f"[TRANSFER] {field}: done -> {target_value}")
        except asyncio.CancelledError:
            print(f"[TRANSFER] {field}: cancelled")
        finally:
            _transfer_tasks.pop(task_key, None)

    task = asyncio.create_task(_interpolate())
    _transfer_tasks[task_key] = task


async def emit_session_ended(session_code: str):
    """Emit session_ended to all clients in the room."""
    await sio.emit("session_ended", {"session_code": session_code}, room=session_code)
