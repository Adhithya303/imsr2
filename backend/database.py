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

            # Scenarios table
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS scenarios (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    patient_details JSON NOT NULL,
                    symptoms JSON NOT NULL,
                    initial_readings JSON NOT NULL
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
                    current_scenario_id INT,
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (current_scenario_id) REFERENCES scenarios(id) ON DELETE SET NULL
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
            
            # Alter table in case it was already created without current_scenario_id
            await cur.execute("SHOW COLUMNS FROM sessions LIKE 'current_scenario_id'")
            has_col = await cur.fetchone()
            if not has_col:
                try:
                    await cur.execute("ALTER TABLE sessions ADD COLUMN current_scenario_id INT NULL")
                    await cur.execute("ALTER TABLE sessions ADD CONSTRAINT fk_sessions_scenarios FOREIGN KEY (current_scenario_id) REFERENCES scenarios(id) ON DELETE SET NULL")
                except Exception as e:
                    print(f"[DB] Info: constraint or column may already exist: {e}")

            # Seed scenarios if table is empty
            await cur.execute("SELECT COUNT(*) as count FROM scenarios")
            count_res = await cur.fetchone()
            if count_res and count_res[0] == 0:
                print("[SEED] Seeding scenarios from patient_monitor_scenarios_20.json...")
                json_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "patient_monitor_scenarios_20.json"))
                if os.path.exists(json_path):
                    with open(json_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    
                    scenarios_to_seed = []
                    for idx, sc in enumerate(data.get("scenarios", [])):
                        pd = sc.get("patientDetails", {})
                        symp = sc.get("symptoms", {})
                        mv = sc.get("monitorValues", {})
                        
                        name = pd.get("patientName", f"Scenario {idx + 1}")
                        scenarios_to_seed.append((
                            name,
                            json.dumps(pd),
                            json.dumps(symp),
                            json.dumps(mv)
                        ))
                    
                    if scenarios_to_seed:
                        await cur.executemany(
                            "INSERT INTO scenarios (name, patient_details, symptoms, initial_readings) VALUES (%s, %s, %s, %s)",
                            scenarios_to_seed
                        )
                        print(f"[SEED] Seeded {len(scenarios_to_seed)} scenarios.")
                else:
                    print(f"[SEED] WARNING: patient_monitor_scenarios_20.json not found at {json_path}")
            
    print(f"[DB] Connected to local MySQL — database: {DB_NAME}")

async def get_db_pool():
    global pool
    return pool
