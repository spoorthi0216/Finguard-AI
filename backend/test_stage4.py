"""
FinGuard AI — Stage 4 Integration Test Suite
Validates the FastAPI backend, SQLite ingestion pipeline,
validation engine, and data access endpoints.
"""

import os
import sys
import json
import unittest
import tempfile
import sqlite3

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import init_db, check_db_health, get_db_connection
from app.services.pipeline import (
    execute_ingestion_pipeline,
    execute_validation_only,
    fetch_persisted_records,
    fetch_persisted_findings,
    fetch_persisted_audit_events,
    fetch_persisted_metrics,
)

SAMPLE_CSV = """rowNumber,companyId,ticker,companyName,sector,period,filingDate,currency,revenue,expenses,reportedProfit,ebitda,creditRating
1,"CIK-0000320193","AAPL","Apple Inc.","Technology","2024-Q1","2024-02-02","USD",119575,85600,33975,39500,"AAA"
2,"CIK-0000789019","MSFT","Microsoft Corporation","Technology","2024-Q1","2024-01-30","USD",62020,35000,27020,31000,"AAA"
3,"CIK-0000019617","JPM","JPMorgan Chase & Co.","Financials","2024-Q1","2024-04-12","USD",41934,28534,13400,15100,"AA-"
4,"CIK-0000034088","XOM","Exxon Mobil Corporation","Energy","2024-Q1","2024-04-26","USD",83083,74863,9220,14700,"AA-"
5,"CIK-0000999001","ORPH","Orphan Corp","Industrials","2024-Q1","2024-03-01","USD",5400,-1200,6600,900,"BB"
"""


class TestStage4BackendIntegration(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_finguard_stage4.db")
        init_db(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_01_database_health_check(self):
        """Verifies check_db_health returns healthy with all 4 tables."""
        health = check_db_health(self.db_path)
        self.assertEqual(health["status"], "healthy")
        self.assertTrue(health["configured"])
        self.assertTrue(health["foreign_keys_enabled"])
        self.assertEqual(len(health["missing_tables"]), 0)
        expected_tables = {"companies", "financial_records", "validation_findings", "audit_events", "ingestion_runs"}
        self.assertTrue(expected_tables.issubset(set(health["tables"])))

    def test_02_execute_ingestion_pipeline_persists_data(self):
        """Verifies that execute_ingestion_pipeline validates and persists records to SQLite."""
        result = execute_ingestion_pipeline(SAMPLE_CSV, db_path=self.db_path)

        self.assertIn("run_id", result)
        self.assertEqual(result["total_records"], 5)
        # Record 4 has profit discrepancy (83083 - 74863 = 8220 != 9220), record 5 has negative expenses
        self.assertGreater(result["flagged_records"], 0)
        self.assertGreater(len(result["validation_findings"]), 0)

        # Verify SQLite tables contain data
        conn = get_db_connection(self.db_path)
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM companies;")
            company_count = cur.fetchone()[0]
            self.assertGreaterEqual(company_count, 4)

            cur.execute("SELECT COUNT(*) FROM financial_records;")
            record_count = cur.fetchone()[0]
            self.assertEqual(record_count, 5)

            cur.execute("SELECT COUNT(*) FROM validation_findings;")
            findings_count = cur.fetchone()[0]
            self.assertGreater(findings_count, 0)

            cur.execute("SELECT COUNT(*) FROM audit_events WHERE action = 'BATCH_INGESTION';")
            audit_count = cur.fetchone()[0]
            self.assertGreaterEqual(audit_count, 1)
        finally:
            conn.close()

    def test_03_execute_validation_only_does_not_persist(self):
        """Verifies that execute_validation_only produces metrics without modifying SQLite."""
        result = execute_validation_only(SAMPLE_CSV)
        self.assertEqual(result["total_records"], 5)
        self.assertIn("data_quality_percentage", result)
        self.assertIn("validation_findings", result)

        # Database should still be empty
        conn = get_db_connection(self.db_path)
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM financial_records;")
            self.assertEqual(cur.fetchone()[0], 0)
        finally:
            conn.close()

    def test_04_fetch_persisted_queries(self):
        """Verifies fetch helper functions read correctly from SQLite."""
        execute_ingestion_pipeline(SAMPLE_CSV, db_path=self.db_path)

        records = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records), 5)
        self.assertIn("companyName", records[0])
        self.assertIn("validationStatus", records[0])

        findings = fetch_persisted_findings(self.db_path)
        self.assertGreater(len(findings), 0)
        self.assertIn("rule_id", findings[0])

        audit = fetch_persisted_audit_events(self.db_path)
        self.assertGreater(len(audit), 0)
        self.assertEqual(audit[0]["action"], "BATCH_INGESTION")

        metrics = fetch_persisted_metrics(self.db_path)
        self.assertEqual(metrics["totalRecords"], 5)
        self.assertGreater(metrics["dataQualityScore"], 0)


if __name__ == "__main__":
    print("=" * 65)
    print(" Running FinGuard AI Stage 4 Integration Tests")
    print("=" * 65)
    unittest.main(verbosity=2)
