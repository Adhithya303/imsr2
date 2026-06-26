"""MongoDB async connection via Motor -- loads from .env, supports Atlas."""

import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "sim_monitor")

# Determine if using Atlas (contains '+srv')
if MONGO_URL and "+srv" in MONGO_URL:
    # Use TLS but allow invalid certificates for dev
    client = AsyncIOMotorClient(MONGO_URL, tls=True, tlsInsecure=True)
else:
    # Fallback to local MongoDB without TLS
    client = AsyncIOMotorClient(MONGO_URL or "mongodb://localhost:27017")

db = client[DB_NAME]

# Collections
users_collection = db["users"]
sessions_collection = db["sessions"]
monitor_state_collection = db["monitor_state"]


async def init_db():
    """Create indexes and collections on startup."""
    existing = await db.list_collection_names()
    for col_name in ["users", "sessions", "monitor_state"]:
        if col_name not in existing:
            await db.create_collection(col_name)
            print(f"[DB] Created collection: {col_name}")

    await users_collection.create_index("username", unique=True)
    await sessions_collection.create_index("session_code", unique=True)
    await monitor_state_collection.create_index("session_id", unique=True)
    print("[DB] Connected to MongoDB Atlas -- indexes ensured")
