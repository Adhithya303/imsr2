"""MySQL async connection via aiomysql -- loads from .env."""

import os
from dotenv import load_dotenv
import aiomysql
import json

load_dotenv()

MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "Adhianu@2886")
DB_NAME = os.getenv("DB_NAME", "imsr")

# Connection pool
pool = None

async def init_db():
    """Create database and tables on startup."""
    global pool
    
    # Connect without DB to create it
    temp_conn = await aiomysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER, password=MYSQL_PASSWORD
    )
    async with temp_conn.cursor() as cur:
        await cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`")
    temp_conn.close()

    # Create connection pool
    pool = await aiomysql.create_pool(
        host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER, password=MYSQL_PASSWORD,
        db=DB_NAME, autocommit=True
    )

    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # Users table
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(50) NOT NULL,
                    created_at DATETIME NOT NULL
                )
            """)

            # Sessions table
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    session_code VARCHAR(50) UNIQUE NOT NULL,
                    created_by INT NOT NULL,
                    started_at DATETIME NOT NULL,
                    ended_at DATETIME,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    event_log JSON,
                    history JSON,
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
                )
            """)

            # Monitor State table
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS monitor_state (
                    session_id INT PRIMARY KEY,
                    state_data JSON,
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
                )
            """)
            
    print(f"[DB] Connected to local MySQL — database: {DB_NAME}")

async def get_db_pool():
    global pool
    return pool
