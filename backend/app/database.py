"""
FinGuard AI — SQLite Database Module (Stage 2)
Provides connection management, schema initialization, and health checks
using Python's built-in sqlite3 module.
"""

import os
import sqlite3
from typing import Optional, List, Dict, Any

# Default database storage directory: backend/data/finguard.db
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BACKEND_DIR, "data")
DEFAULT_DB_PATH = os.path.join(DATA_DIR, "finguard.db")


def get_db_path(custom_path: Optional[str] = None) -> str:
    """
    Returns the resolved SQLite database path.
    Falls back to DB_PATH environment variable or DEFAULT_DB_PATH.
    """
    if custom_path:
        return custom_path
    return os.getenv("DB_PATH", DEFAULT_DB_PATH)


def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """
    Opens a connection to the SQLite database.
    - Ensures parent directory exists safely.
    - Enables foreign key constraint enforcement (PRAGMA foreign_keys = ON).
    - Sets sqlite3.Row row_factory for dictionary-like column access.
    """
    resolved_path = get_db_path(db_path)

    # In-memory databases (e.g. ":memory:") do not require a directory
    if resolved_path != ":memory:":
        parent_dir = os.path.dirname(resolved_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)

    conn = sqlite3.connect(resolved_path)
    
    # CRITICAL: SQLite disables foreign keys by default per-connection.
    # We must explicitly turn foreign key enforcement ON.
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """
    Initializes the database schema if tables do not already exist.
    Preserves all existing data (safe IF NOT EXISTS DDL and non-destructive migrations).
    """
    conn = get_db_connection(db_path)
    try:
        with conn:
            # Safe migration: inspect existing companies table if it has restrictive NOT NULL
            cursor = conn.cursor()
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='companies';")
            comp_sql = cursor.fetchone()
            if comp_sql and comp_sql[0]:
                sql_upper = comp_sql[0].upper()
                if "NAME TEXT NOT NULL" in sql_upper or "TICKER TEXT NOT NULL" in sql_upper or "SECTOR TEXT NOT NULL" in sql_upper:
                    conn.execute("PRAGMA foreign_keys = OFF;")
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS companies_migration (
                            company_id TEXT PRIMARY KEY,
                            ticker TEXT,
                            name TEXT,
                            sector TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    conn.execute("""
                        INSERT OR IGNORE INTO companies_migration (company_id, ticker, name, sector, created_at)
                        SELECT company_id, ticker, name, sector, created_at FROM companies;
                    """)
                    conn.execute("DROP TABLE companies;")
                    conn.execute("ALTER TABLE companies_migration RENAME TO companies;")
                    conn.execute("PRAGMA foreign_keys = ON;")

            # Safe migration: inspect existing financial_records table if company_id is NOT NULL
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='financial_records';")
            rec_sql = cursor.fetchone()
            if rec_sql and rec_sql[0]:
                sql_upper = rec_sql[0].upper()
                if "COMPANY_ID TEXT NOT NULL" in sql_upper:
                    conn.execute("PRAGMA foreign_keys = OFF;")
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS financial_records_migration (
                            id TEXT PRIMARY KEY,
                            company_id TEXT,
                            period TEXT NOT NULL,
                            revenue REAL,
                            expenses REAL,
                            reported_profit REAL,
                            calculated_profit REAL,
                            profit_discrepancy REAL,
                            validation_status TEXT NOT NULL,
                            raw_payload TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (company_id) REFERENCES companies (company_id) ON DELETE CASCADE
                        );
                    """)
                    conn.execute("""
                        INSERT OR REPLACE INTO financial_records_migration (
                            id, company_id, period, revenue, expenses, reported_profit,
                            calculated_profit, profit_discrepancy, validation_status,
                            raw_payload, created_at, updated_at
                        )
                        SELECT 
                            id, company_id, period, revenue, expenses, reported_profit,
                            calculated_profit, profit_discrepancy, validation_status,
                            raw_payload, created_at, updated_at
                        FROM financial_records;
                    """)
                    conn.execute("DROP TABLE financial_records;")
                    conn.execute("ALTER TABLE financial_records_migration RENAME TO financial_records;")
                    conn.execute("PRAGMA foreign_keys = ON;")

            # 1. Companies Master Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS companies (
                    company_id TEXT PRIMARY KEY,
                    ticker TEXT,
                    name TEXT,
                    sector TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # 2. Financial Records Ledger Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS financial_records (
                    id TEXT PRIMARY KEY,
                    company_id TEXT,
                    period TEXT NOT NULL,
                    revenue REAL,
                    expenses REAL,
                    reported_profit REAL,
                    calculated_profit REAL,
                    profit_discrepancy REAL,
                    validation_status TEXT NOT NULL,
                    raw_payload TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (company_id) REFERENCES companies (company_id) ON DELETE CASCADE
                );
            """)

            # 3. Validation Findings Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS validation_findings (
                    id TEXT PRIMARY KEY,
                    run_id TEXT,
                    record_id TEXT NOT NULL,
                    rule_id TEXT NOT NULL,
                    rule_name TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    issue_type TEXT NOT NULL,
                    column_name TEXT,
                    affected_value TEXT,
                    expected_value TEXT,
                    message TEXT,
                    status TEXT DEFAULT 'OPEN',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (record_id) REFERENCES financial_records (id) ON DELETE CASCADE
                );
            """)

            # Safe column migration for existing validation_findings table
            cursor.execute("PRAGMA table_info(validation_findings);")
            vf_cols = {r["name"] for r in cursor.fetchall()}
            if "run_id" not in vf_cols:
                conn.execute("ALTER TABLE validation_findings ADD COLUMN run_id TEXT;")
            if "column_name" not in vf_cols:
                conn.execute("ALTER TABLE validation_findings ADD COLUMN column_name TEXT;")
            if "message" not in vf_cols:
                conn.execute("ALTER TABLE validation_findings ADD COLUMN message TEXT;")

            # 4. Ingestion Runs Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ingestion_runs (
                    run_id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    total_rows INTEGER DEFAULT 0,
                    accepted_records INTEGER DEFAULT 0,
                    rejected_records INTEGER DEFAULT 0,
                    findings_count INTEGER DEFAULT 0,
                    status TEXT NOT NULL,
                    error_summary TEXT
                );
            """)

            # 5. Audit Events Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS audit_events (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    record_id TEXT,
                    action TEXT NOT NULL,
                    field_name TEXT NOT NULL,
                    before_value TEXT,
                    after_value TEXT,
                    justification TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (record_id) REFERENCES financial_records (id) ON DELETE SET NULL
                );
            """)

            # 6. Performance Indexes
            conn.execute("CREATE INDEX IF NOT EXISTS idx_records_company ON financial_records (company_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_records_period ON financial_records (period);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_findings_record ON validation_findings (record_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_findings_run ON validation_findings (run_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_events (record_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_run ON audit_events (run_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_status ON ingestion_runs (status);")
    finally:
        conn.close()


def check_db_health(db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Verifies actual database connectivity and schema readiness.
    Performs a real 'SELECT 1' query and retrieves existing table names.
    Does NOT report healthy unless query succeeds.
    """
    resolved_path = get_db_path(db_path)
    try:
        conn = get_db_connection(resolved_path)
        try:
            # 1. Execute verification query
            cursor = conn.cursor()
            cursor.execute("SELECT 1 AS alive;")
            row = cursor.fetchone()
            if not row or row["alive"] != 1:
                return {
                    "configured": True,
                    "status": "unhealthy",
                    "error": "Database query check failed to return expected scalar.",
                    "path": resolved_path,
                }

            # 2. Check foreign_keys pragma status
            cursor.execute("PRAGMA foreign_keys;")
            fk_status = cursor.fetchone()
            foreign_keys_enabled = bool(fk_status[0]) if fk_status else False

            # 3. Retrieve existing tables
            cursor.execute("""
                SELECT name FROM sqlite_master
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name;
            """)
            existing_tables: List[str] = [r["name"] for r in cursor.fetchall()]

            required_tables = {"companies", "financial_records", "validation_findings", "audit_events", "ingestion_runs"}
            missing_tables = sorted(list(required_tables - set(existing_tables)))

            return {
                "configured": True,
                "status": "healthy" if not missing_tables else "degraded",
                "path": resolved_path,
                "foreign_keys_enabled": foreign_keys_enabled,
                "tables": existing_tables,
                "missing_tables": missing_tables,
            }
        finally:
            conn.close()
    except Exception as exc:
        return {
            "configured": True,
            "status": "unhealthy",
            "error": str(exc),
            "path": resolved_path,
        }
