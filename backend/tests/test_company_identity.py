"""
FinGuard AI — Company Identity and Record Traceability Regression Test Suite
Validates:
1. Company ID preservation during CSV ingestion and SQLite persistence.
2. Company name and sector preservation when provided.
3. Explicit null representation for missing company names (no synthetic 'Unknown Corp' or 'UNKNOWN').
4. Transparent handling of unknown company IDs without silent misattribution.
5. Non-destructive company updates: preventing empty or whitespace metadata from overwriting existing valid metadata.
"""

import os
import sys
import unittest
import tempfile

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import init_db, get_db_connection
from app.services.ingestion import read_and_normalize_csv
from app.services.pipeline import (
    execute_ingestion_pipeline,
    fetch_persisted_records,
)


class TestCompanyIdentityRegression(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_identity.db")
        init_db(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_01_company_id_preservation_during_ingestion(self):
        """Verifies original company_id or supported aliases are preserved exactly."""
        csv_data = """company_id,period,revenue,expenses,reported_profit
CIK-0001018288,2024-Q1,147977,133300,14677
LEI-5493006MHB84DD0ZWV18,2024-Q1,50000,30000,20000
CUSTOM-CORP-ID-999,2024-Q1,10000,8000,2000
"""
        df, meta = read_and_normalize_csv(csv_data)
        ingested_ids = list(df["company_id"])
        self.assertEqual(ingested_ids, [
            "CIK-0001018288",
            "LEI-5493006MHB84DD0ZWV18",
            "CUSTOM-CORP-ID-999",
        ])

        # Persist and verify in SQLite
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        persisted = fetch_persisted_records(self.db_path)
        persisted_ids = [r["companyId"] for r in persisted]
        self.assertEqual(persisted_ids, [
            "CIK-0001018288",
            "LEI-5493006MHB84DD0ZWV18",
            "CUSTOM-CORP-ID-999",
        ])

    def test_02_company_name_and_sector_preservation(self):
        """Verifies company name and sector values are preserved exactly when provided."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
COMP-101,NVDA,NVIDIA Corporation,Semiconductors,2024-Q1,26044,11000,15044
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        persisted = fetch_persisted_records(self.db_path)
        self.assertEqual(len(persisted), 1)
        self.assertEqual(persisted[0]["companyName"], "NVIDIA Corporation")
        self.assertEqual(persisted[0]["sector"], "Semiconductors")
        self.assertEqual(persisted[0]["ticker"], "NVDA")

    def test_03_missing_company_name_represented_as_null(self):
        """Verifies missing company names are stored and returned as None/null, never 'Unknown Corp'."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
COMP-NO-NAME,NONAME,,Technology,2024-Q1,5000,4000,1000
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        persisted = fetch_persisted_records(self.db_path)
        self.assertEqual(len(persisted), 1)
        self.assertIsNone(persisted[0]["companyName"])
        self.assertNotEqual(persisted[0]["companyName"], "Unknown Corp")
        self.assertNotEqual(persisted[0]["companyName"], "UNKNOWN")

    def test_04_unknown_company_id_handling(self):
        """Verifies unknown company IDs are handled transparently and not mapped to other entities."""
        csv_data = """company_id,period,revenue,expenses,reported_profit
UNKNOWN-ENTITY-X,2024-Q1,12000,9000,3000
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        persisted = fetch_persisted_records(self.db_path)
        self.assertEqual(len(persisted), 1)
        self.assertEqual(persisted[0]["companyId"], "UNKNOWN-ENTITY-X")
        self.assertIsNone(persisted[0]["companyName"])

        # Check companies table
        conn = get_db_connection(self.db_path)
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM companies WHERE company_id = 'UNKNOWN-ENTITY-X';")
            row = cur.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["company_id"], "UNKNOWN-ENTITY-X")
            self.assertIsNone(row["name"])
        finally:
            conn.close()

    def test_05_preventing_empty_metadata_overwrite(self):
        """Verifies empty or whitespace metadata does not overwrite existing valid company metadata."""
        # 1. Initial ingestion with full metadata
        batch1 = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
COMP-STABLE,STBL,Stable Alpha Corp,Financials,2024-Q1,50000,35000,15000
"""
        execute_ingestion_pipeline(batch1, db_path=self.db_path)

        # Verify company is saved
        conn = get_db_connection(self.db_path)
        try:
            cur = conn.cursor()
            cur.execute("SELECT ticker, name, sector FROM companies WHERE company_id = 'COMP-STABLE';")
            row = cur.fetchone()
            self.assertEqual(row["name"], "Stable Alpha Corp")
            self.assertEqual(row["ticker"], "STBL")
            self.assertEqual(row["sector"], "Financials")
        finally:
            conn.close()

        # 2. Subsequent ingestion for same company with empty/blank metadata fields
        batch2 = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
COMP-STABLE,,,   ,2024-Q2,60000,42000,18000
"""
        execute_ingestion_pipeline(batch2, db_path=self.db_path)

        # Verify company metadata was NOT overwritten with empty/blank values
        conn = get_db_connection(self.db_path)
        try:
            cur = conn.cursor()
            cur.execute("SELECT ticker, name, sector FROM companies WHERE company_id = 'COMP-STABLE';")
            row = cur.fetchone()
            self.assertEqual(row["name"], "Stable Alpha Corp")
            self.assertEqual(row["ticker"], "STBL")
            self.assertEqual(row["sector"], "Financials")
        finally:
            conn.close()

        # 3. New valid metadata for a missing field CAN update it
        batch3_init = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
COMP-PARTIAL,PRTL,,,2024-Q1,10000,7000,3000
"""
        execute_ingestion_pipeline(batch3_init, db_path=self.db_path)

        # Later batch provides the missing company_name and sector
        batch3_update = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
COMP-PARTIAL,PRTL,Partial Reconciled Inc.,Technology,2024-Q2,12000,8000,4000
"""
        execute_ingestion_pipeline(batch3_update, db_path=self.db_path)

        conn = get_db_connection(self.db_path)
        try:
            cur = conn.cursor()
            cur.execute("SELECT ticker, name, sector FROM companies WHERE company_id = 'COMP-PARTIAL';")
            row = cur.fetchone()
            self.assertEqual(row["name"], "Partial Reconciled Inc.")
            self.assertEqual(row["sector"], "Technology")
            self.assertEqual(row["ticker"], "PRTL")
        finally:
            conn.close()


if __name__ == "__main__":
    print("=" * 65)
    print(" Running FinGuard AI Company Identity Regression Tests")
    print("=" * 65)
    unittest.main(verbosity=2)
