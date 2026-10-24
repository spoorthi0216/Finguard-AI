"""
FinGuard AI — Stage 4.1 Regression Test Suite
Implementation Task 1: Company Identity and Record Traceability

Tests:
1. Preservation of original company_id from uploaded CSV into SQLite and API responses.
2. Preservation of company names and sectors when supplied.
3. Explicit missing/null company name when not supplied (NO "Unknown Corp", "UNKNOWN", or "Technology").
4. Safe handling of records with unknown or missing company_id (does not silently associate with another company or drop record).
5. Non-destructive UPSERT: Existing non-empty metadata is NEVER overwritten by null/empty on re-ingestion; previously missing metadata IS populated when valid data arrives.
6. Foreign key integrity and query accuracy across companies and financial_records tables.
"""

import os
import sys
import tempfile
import sqlite3
import unittest

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import init_db, check_db_health, get_db_connection
from app.services.ingestion import read_and_normalize_csv
from app.services.validator import FinancialValidationEngine
from app.services.pipeline import (
    execute_ingestion_pipeline,
    execute_validation_only,
    fetch_persisted_records,
    fetch_persisted_findings,
    fetch_persisted_metrics,
)


class TestCompanyIdentityAndRecordTraceability(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_identity.db")
        init_db(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_01_preserve_original_company_id_and_metadata(self):
        """Verifies original company_id, company name, ticker, and sector are preserved exactly."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-0000320193,AAPL,Apple Inc.,Technology,2024-Q1,119575,85600,33975
LEI-5493006MHB84DD0ZWV18,NVDA,NVIDIA Corporation,Semiconductors,2024-Q1,26044,12400,13644
CUSTOM_ID_999,,Acme Holdings,Industrials,2024-Q1,5000,3000,2000
"""
        result = execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        self.assertEqual(result["total_records"], 3)

        records = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records), 3)

        # Record 1
        self.assertEqual(records[0]["companyId"], "CIK-0000320193")
        self.assertEqual(records[0]["companyName"], "Apple Inc.")
        self.assertEqual(records[0]["ticker"], "AAPL")
        self.assertEqual(records[0]["sector"], "Technology")

        # Record 2
        self.assertEqual(records[1]["companyId"], "LEI-5493006MHB84DD0ZWV18")
        self.assertEqual(records[1]["companyName"], "NVIDIA Corporation")
        self.assertEqual(records[1]["ticker"], "NVDA")
        self.assertEqual(records[1]["sector"], "Semiconductors")

        # Record 3 (ticker omitted)
        self.assertEqual(records[2]["companyId"], "CUSTOM_ID_999")
        self.assertEqual(records[2]["companyName"], "Acme Holdings")
        self.assertIsNone(records[2]["ticker"])
        self.assertEqual(records[2]["sector"], "Industrials")

    def test_02_missing_company_name_is_explicitly_null(self):
        """Verifies genuinely missing company names are represented as None/null, not 'Unknown Corp'."""
        csv_data = """company_id,ticker,period,revenue,expenses,reported_profit
CIK-0000123456,TEST,2024-Q1,1000,800,200
"""
        # Validate only
        val_result = execute_validation_only(csv_data)
        record = val_result["records"][0]
        self.assertEqual(record["company_id"], "CIK-0000123456")
        self.assertIsNone(record["company_name"])
        self.assertNotEqual(record["company_name"], "Unknown Corp")

        # Ingestion and persistence
        ing_result = execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        records = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["companyId"], "CIK-0000123456")
        self.assertIsNone(records[0]["companyName"])
        self.assertNotEqual(records[0]["companyName"], "Unknown Corp")
        self.assertIsNone(records[0]["sector"])
        self.assertNotEqual(records[0]["sector"], "Technology")

    def test_03_missing_company_id_handling_and_traceability(self):
        """Verifies missing company_id is flagged as critical issue and stored without synthetic association."""
        csv_data = """company_id,ticker,company_name,period,revenue,expenses,reported_profit
,ORPH,Missing Id Corp,2024-Q1,500,400,100
"""
        result = execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        self.assertEqual(result["total_records"], 1)
        self.assertEqual(result["flagged_records"], 1)

        # Check critical finding on company_id
        findings = result["validation_findings"]
        missing_id_findings = [f for f in findings if f["rule_id"] == "RULE_MISSING_VALUE" and f["column_name"] == "company_id"]
        self.assertEqual(len(missing_id_findings), 1)
        self.assertEqual(missing_id_findings[0]["severity"], "CRITICAL")

        # Check persisted record in SQLite
        records = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records), 1)
        self.assertIsNone(records[0]["companyId"])
        self.assertNotEqual(records[0]["companyId"], "UNKNOWN")

    def test_04_unknown_company_id_registered_transparently(self):
        """Verifies unknown company IDs are transparently registered without being remapped to another company."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
NEW_ENT_777,NWENT,New Horizon Ventures,Energy,2024-Q1,12000,9000,3000
"""
        result = execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        records = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["companyId"], "NEW_ENT_777")
        self.assertEqual(records[0]["companyName"], "New Horizon Ventures")
        self.assertEqual(records[0]["sector"], "Energy")

        # Verify entry in master companies table
        conn = get_db_connection(self.db_path)
        try:
            cur = conn.cursor()
            cur.execute("SELECT company_id, name, sector FROM companies WHERE company_id = 'NEW_ENT_777';")
            row = cur.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["company_id"], "NEW_ENT_777")
            self.assertEqual(row["name"], "New Horizon Ventures")
            self.assertEqual(row["sector"], "Energy")
        finally:
            conn.close()

    def test_05_non_destructive_upsert_preserves_metadata(self):
        """Verifies re-ingestion with empty metadata does NOT overwrite existing company information."""
        # 1. Initial ingestion with full company metadata
        csv_batch_1 = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-0000320193,AAPL,Apple Inc.,Technology,2024-Q1,119575,85600,33975
"""
        execute_ingestion_pipeline(csv_batch_1, db_path=self.db_path)

        # 2. Second ingestion for the same company with missing company_name and sector
        csv_batch_2 = """rowNumber,company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
2,CIK-0000320193,AAPL,,,2024-Q2,90753,67100,23653
"""
        execute_ingestion_pipeline(csv_batch_2, db_path=self.db_path)

        # Verify company master record retains 'Apple Inc.' and 'Technology'
        conn = get_db_connection(self.db_path)
        try:
            cur = conn.cursor()
            cur.execute("SELECT company_id, ticker, name, sector FROM companies WHERE company_id = 'CIK-0000320193';")
            row = cur.fetchone()
            self.assertEqual(row["name"], "Apple Inc.")
            self.assertEqual(row["sector"], "Technology")
            self.assertEqual(row["ticker"], "AAPL")
        finally:
            conn.close()

        # Both records should be associated with Apple Inc.
        records = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records), 2)
        for r in records:
            self.assertEqual(r["companyId"], "CIK-0000320193")
            self.assertEqual(r["companyName"], "Apple Inc.")

    def test_06_incoming_valid_metadata_populates_missing_fields(self):
        """Verifies incoming valid metadata populates fields that were previously missing/null."""
        # 1. Ingest record with missing company name and sector
        csv_batch_1 = """company_id,period,revenue,expenses,reported_profit
CIK-0000789019,2024-Q1,62020,35000,27020
"""
        execute_ingestion_pipeline(csv_batch_1, db_path=self.db_path)

        # Verify initial missing state
        records_1 = fetch_persisted_records(self.db_path)
        self.assertIsNone(records_1[0]["companyName"])

        # 2. Re-ingest with valid company name and sector
        csv_batch_2 = """rowNumber,company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
2,CIK-0000789019,MSFT,Microsoft Corporation,Technology,2024-Q2,65000,36000,29000
"""
        execute_ingestion_pipeline(csv_batch_2, db_path=self.db_path)

        # Verify both records now have Microsoft Corporation populated
        records_2 = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records_2), 2)
        self.assertEqual(records_2[0]["companyName"], "Microsoft Corporation")
        self.assertEqual(records_2[1]["companyName"], "Microsoft Corporation")
        self.assertEqual(records_2[0]["ticker"], "MSFT")
        self.assertEqual(records_2[1]["ticker"], "MSFT")

    def test_07_zero_financial_values_preserved_not_null(self):
        """Verifies legitimate zero financial values (revenue=0, expenses=0, profit=0) are preserved as 0.0, not null."""
        csv_data = """company_id,ticker,company_name,period,revenue,expenses,reported_profit
CIK-ZERO-001,ZERO,Zero Corp,2024-Q1,0,0,0
"""
        result = execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        records = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["revenue"], 0.0)
        self.assertEqual(records[0]["expenses"], 0.0)
        self.assertEqual(records[0]["reportedProfit"], 0.0)
        self.assertEqual(records[0]["calculatedProfit"], 0.0)
        self.assertEqual(records[0]["profitDiscrepancy"], 0.0)


if __name__ == "__main__":
    print("=" * 70)
    print(" Running FinGuard AI Task 1: Company Identity & Traceability Tests")
    print("=" * 70)
    unittest.main(verbosity=2)
