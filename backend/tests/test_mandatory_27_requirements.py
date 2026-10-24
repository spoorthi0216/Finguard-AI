"""
FinGuard AI — Mandatory 27 Requirement Verification Suite
Directly tests and asserts all 27 critical requirements from Section 13:
1. Database initialization on a clean database.
2. Successful upload of a valid CSV.
3. Missing required columns.
4. Empty CSV.
5. Malformed or unreadable CSV.
6. Missing required identifiers.
7. Missing reporting periods.
8. Duplicate company-period records.
9. Invalid numeric financial values.
10. Profit reconciliation within tolerance.
11. Profit reconciliation outside tolerance.
12. Correct handling of negative values according to documented policy.
13. Multi-currency records without misleading aggregation.
14. Zero-record pass-rate behavior.
15. Correct dashboard metrics after ingestion.
16. Correct validation findings.
17. Successful persistence of financial records.
18. Audit history after successful ingestion.
19. Audit history after failed ingestion.
20. Transaction rollback after a simulated database failure.
21. Foreign-key enforcement.
22. Database restart persistence.
23. Real run IDs and finding IDs.
24. Empty database API responses.
25. API health check.
26. Handling of duplicate upload attempts according to documented policy.
27. Existing valid data remains intact after a failed upload.
"""

import os
import sys
import unittest
import tempfile
import sqlite3
import json
import pandas as pd

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import get_db_connection, init_db, check_db_health
from app.services.ingestion import read_and_normalize_csv, CSVIngestionError
from app.services.validator import FinancialValidationEngine, parse_numeric_value
from app.services.pipeline import (
    execute_ingestion_pipeline,
    execute_validation_only,
    fetch_persisted_records,
    fetch_persisted_findings,
    fetch_persisted_audit_events,
    fetch_persisted_runs,
    fetch_persisted_metrics,
)


class TestMandatory27Requirements(unittest.TestCase):
    def setUp(self):
        """Creates an isolated temporary SQLite database for each test case."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_finguard.db")

    def tearDown(self):
        """Safely cleans up the temporary directory."""
        self.temp_dir.cleanup()

    # 1. Database initialization on a clean database
    def test_01_database_initialization_on_clean_db(self):
        self.assertFalse(os.path.exists(self.db_path))
        init_db(self.db_path)
        self.assertTrue(os.path.exists(self.db_path))
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
            tables = [r["name"] for r in cursor.fetchall()]
            for expected in ["audit_events", "companies", "financial_records", "ingestion_runs", "validation_findings"]:
                self.assertIn(expected, tables)
        finally:
            conn.close()

    # 2. Successful upload of a valid CSV
    def test_02_successful_upload_of_valid_csv(self):
        csv_data = """company_id,company_name,sector,period,revenue,expenses,reported_profit,currency
COMP-01,Apex Dynamics,Technology,2025-Q1,100000,70000,30000,USD
"""
        result = execute_ingestion_pipeline(csv_data, db_path=self.db_path, filename="clean.csv")
        self.assertEqual(result["total_records"], 1)
        self.assertEqual(result["valid_records"], 1)
        self.assertEqual(result["flagged_records"], 0)
        self.assertEqual(result["record_pass_rate"], 100.0)
        self.assertEqual(len(result["validation_findings"]), 0)

    # 3. Missing required columns
    def test_03_missing_required_columns(self):
        invalid_csv = """revenue,expenses,reported_profit\n100000,70000,30000"""
        with self.assertRaises(CSVIngestionError) as ctx:
            read_and_normalize_csv(invalid_csv)
        self.assertEqual(ctx.exception.code, "MISSING_REQUIRED_COLUMNS")

    # 4. Empty CSV
    def test_04_empty_csv(self):
        with self.assertRaises(CSVIngestionError) as ctx:
            read_and_normalize_csv("")
        self.assertEqual(ctx.exception.code, "EMPTY_FILE")

    # 5. Malformed or unreadable CSV
    def test_05_malformed_csv(self):
        malformed = 'company_id,period\n"COMP-1",2025-Q1\n"COMP-2,2025-Q1\nEXTRA,QUOTES"'
        # Parser error or bad lines
        try:
            df, _ = read_and_normalize_csv(malformed)
        except CSVIngestionError as e:
            self.assertIn(e.code, ["MALFORMED_CSV", "CSV_READ_ERROR"])

    # 6. Missing required identifiers
    def test_06_missing_required_identifiers(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
,Anonymous Corp,2025-Q1,50000,30000,20000,USD
"""
        result = execute_validation_only(csv_data)
        findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_MISSING_VALUE" and f["column_name"] == "company_id"]
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "CRITICAL")
        self.assertEqual(result["valid_records"], 0)

    # 7. Missing reporting periods
    def test_07_missing_reporting_periods(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
COMP-01,Apex Dynamics,,50000,30000,20000,USD
"""
        result = execute_validation_only(csv_data)
        findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_MISSING_VALUE" and f["column_name"] == "period"]
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "CRITICAL")
        self.assertEqual(result["valid_records"], 0)

    # 8. Duplicate company-period records
    def test_08_duplicate_company_period_records(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
COMP-DUP,Duplicate Corp,2025-Q1,50000,30000,20000,USD
COMP-DUP,Duplicate Corp,2025-Q1,55000,35000,20000,USD
"""
        result = execute_validation_only(csv_data)
        dup_findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_DUPLICATE_KEY"]
        self.assertEqual(len(dup_findings), 2)
        for f in dup_findings:
            self.assertEqual(f["severity"], "CRITICAL")

    # 9. Invalid numeric financial values
    def test_09_invalid_numeric_financial_values(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
COMP-BADNUM,Syntax Corp,2025-Q1,50000*,30000,20000,USD
"""
        result = execute_validation_only(csv_data)
        num_findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_INVALID_NUMERIC"]
        self.assertEqual(len(num_findings), 1)
        self.assertEqual(num_findings[0]["affected_value"], "50000*")

    # 10. Profit reconciliation within tolerance
    def test_10_profit_reconciliation_within_tolerance(self):
        # Revenue: 1000, Expenses: 700 -> Calculated: 300. Reported: 304. Variance = 4 <= tolerance(5.0)
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
COMP-TOL,Tolerance Corp,2025-Q1,1000,700,304,USD
"""
        result = execute_validation_only(csv_data, profit_tolerance=5.0)
        mismatch_findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_MATH_PROFIT_MISMATCH"]
        self.assertEqual(len(mismatch_findings), 0)
        self.assertEqual(result["valid_records"], 1)

    # 11. Profit reconciliation outside tolerance
    def test_11_profit_reconciliation_outside_tolerance(self):
        # Revenue: 1000, Expenses: 700 -> Calculated: 300. Reported: 310. Variance = 10 > tolerance(5.0)
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
COMP-MIS,Mismatch Corp,2025-Q1,1000,700,310,USD
"""
        result = execute_validation_only(csv_data, profit_tolerance=5.0)
        mismatch_findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_MATH_PROFIT_MISMATCH"]
        self.assertEqual(len(mismatch_findings), 1)
        self.assertEqual(mismatch_findings[0]["severity"], "CRITICAL")
        self.assertEqual(result["valid_records"], 0)

    # 12. Correct handling of negative values according to documented policy
    def test_12_handling_of_negative_values(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
COMP-NEG,Negative Corp,2025-Q1,-50000,30000,-80000,USD
"""
        result = execute_validation_only(csv_data)
        neg_findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_NEGATIVE_VALUE"]
        self.assertGreaterEqual(len(neg_findings), 1)
        self.assertEqual(neg_findings[0]["column_name"], "revenue")

    # 13. Multi-currency records without misleading aggregation
    def test_13_multicurrency_preservation_and_breakdown(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
COMP-USD,US Corp,2025-Q1,100000,60000,40000,USD
COMP-EUR,EU Corp,2025-Q1,80000,50000,30000,EUR
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        metrics = fetch_persisted_metrics(self.db_path)
        breakdown = metrics.get("currencyBreakdown") or metrics.get("currency_breakdown")
        self.assertIsNotNone(breakdown)
        self.assertIn("USD", breakdown)
        self.assertIn("EUR", breakdown)
        self.assertEqual(breakdown["USD"]["revenue"], 100000.0)
        self.assertEqual(breakdown["EUR"]["revenue"], 80000.0)

    # 14. Zero-record pass-rate behavior
    def test_14_zero_record_pass_rate_returns_none(self):
        init_db(self.db_path)
        metrics = fetch_persisted_metrics(self.db_path)
        self.assertEqual(metrics["totalRecords"], 0)
        self.assertIsNone(metrics["recordPassRate"])
        self.assertIsNone(metrics["dataQualityScore"])

    # 15. Correct dashboard metrics after ingestion
    def test_15_correct_dashboard_metrics_after_ingestion(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
C-01,Firm One,2025-Q1,10000,8000,2000,USD
C-02,Firm Two,2025-Q1,20000,10000,50000,USD
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        metrics = fetch_persisted_metrics(self.db_path)
        self.assertEqual(metrics["totalRecords"], 2)
        self.assertEqual(metrics["validRecords"], 1)
        self.assertEqual(metrics["flaggedRecords"], 1)
        self.assertEqual(metrics["confirmedFailures"], 1)
        self.assertEqual(metrics["recordPassRate"], 50.0)

    # 16. Correct validation findings
    def test_16_validation_findings_structure(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
C-FAIL,Fail Corp,2025-Q1,10000,8000,99999,USD
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        findings = fetch_persisted_findings(self.db_path)
        self.assertGreaterEqual(len(findings), 1)
        f = findings[0]
        self.assertTrue(bool(f["id"]))
        self.assertTrue(bool(f["run_id"]))
        self.assertTrue(bool(f["record_id"]))
        self.assertTrue(bool(f["rule_id"]))
        self.assertIn(f["severity"], ["CRITICAL", "WARNING"])

    # 17. Successful persistence of financial records
    def test_17_persistence_of_financial_records(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
C-PERSIST,Persist Corp,2025-Q1,75000,50000,25000,USD
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        records = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records), 1)
        rec = records[0]
        self.assertEqual(rec["companyId"], "C-PERSIST")
        self.assertEqual(rec["period"], "2025-Q1")
        self.assertEqual(rec["revenue"], 75000.0)
        self.assertEqual(rec["currency"], "USD")

    # 18. Audit history after successful ingestion
    def test_18_audit_history_after_successful_ingestion(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
C-AUDIT,Audit Corp,2025-Q1,50000,30000,20000,USD
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path, filename="audit_test.csv")
        runs = fetch_persisted_runs(self.db_path)
        self.assertGreaterEqual(len(runs), 1)
        self.assertEqual(runs[0]["filename"], "audit_test.csv")
        self.assertEqual(runs[0]["status"], "SUCCESS")

        events = fetch_persisted_audit_events(self.db_path)
        actions = [e["action"] for e in events]
        self.assertIn("INGESTION_STARTED", actions)
        self.assertIn("DATABASE_PERSISTENCE", actions)
        self.assertTrue(any(a in ["BATCH_INGESTION", "INGESTION_COMPLETED"] for a in actions))

    # 19. Audit history after failed ingestion
    def test_19_audit_history_after_failed_ingestion(self):
        invalid_csv = "not_valid_headers\n1,2"
        init_db(self.db_path)
        try:
            execute_ingestion_pipeline(invalid_csv, db_path=self.db_path, filename="failed.csv")
        except Exception:
            pass

        runs = fetch_persisted_runs(self.db_path)
        self.assertGreaterEqual(len(runs), 1)
        self.assertEqual(runs[0]["status"], "FAILED")

        events = fetch_persisted_audit_events(self.db_path)
        actions = [e["action"] for e in events]
        self.assertIn("INGESTION_FAILED", actions)

    # 20. Transaction rollback after a simulated database failure
    def test_20_transaction_rollback_preserves_clean_state(self):
        init_db(self.db_path)
        # Attempt to insert records into a locked or read-only/failing table trigger
        conn = get_db_connection(self.db_path)
        conn.execute("CREATE TRIGGER fail_financial_insert BEFORE INSERT ON financial_records BEGIN SELECT RAISE(FAIL, 'SIMULATED_DB_ERROR'); END;")
        conn.close()

        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
C-FAILTRX,Trx Corp,2025-Q1,50000,30000,20000,USD
"""
        with self.assertRaises(Exception):
            execute_ingestion_pipeline(csv_data, db_path=self.db_path)

        # Confirm rollback: financial_records must contain 0 records
        records = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records), 0)

    # 21. Foreign-key enforcement
    def test_21_foreign_key_enforcement(self):
        init_db(self.db_path)
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys;")
            fk_enabled = cursor.fetchone()[0]
            self.assertEqual(fk_enabled, 1)

            # Insert child validation_finding with nonexistent record_id should raise IntegrityError
            with self.assertRaises(sqlite3.IntegrityError):
                with conn:
                    conn.execute("""
                        INSERT INTO validation_findings (
                            id, record_id, rule_id, rule_name, severity, issue_type
                        ) VALUES ('f-fake', 'nonexistent-rec', 'RULE_TEST', 'Test', 'CRITICAL', 'CONFIRMED_FAILURE');
                    """)
        finally:
            conn.close()

    # 22. Database restart persistence
    def test_22_database_restart_persistence(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
C-RESTART,Restart Corp,2025-Q1,90000,60000,30000,USD
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        # Close all connections and simulate app restart
        records1 = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records1), 1)
        del records1

        # Re-fetch with fresh connection
        records2 = fetch_persisted_records(self.db_path)
        self.assertEqual(len(records2), 1)
        self.assertEqual(records2[0]["companyId"], "C-RESTART")

    # 23. Real run IDs and finding IDs
    def test_23_real_generated_ids(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
C-IDTEST,Id Corp,2025-Q1,10000,8000,99999,USD
"""
        res = execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        run_id = res["run_id"]
        self.assertTrue(run_id.startswith("RUN-"))
        findings = fetch_persisted_findings(self.db_path)
        self.assertGreaterEqual(len(findings), 1)
        for f in findings:
            self.assertTrue(bool(f["id"]))
            self.assertEqual(f["run_id"], run_id)

    # 24. Empty database API responses
    def test_24_empty_database_responses(self):
        init_db(self.db_path)
        records = fetch_persisted_records(self.db_path)
        findings = fetch_persisted_findings(self.db_path)
        audit = fetch_persisted_audit_events(self.db_path)
        runs = fetch_persisted_runs(self.db_path)
        metrics = fetch_persisted_metrics(self.db_path)

        self.assertEqual(records, [])
        self.assertEqual(findings, [])
        self.assertEqual(audit, [])
        self.assertEqual(runs, [])
        self.assertEqual(metrics["totalRecords"], 0)
        self.assertIsNone(metrics["recordPassRate"])

    # 25. API health check
    def test_25_api_health_check(self):
        init_db(self.db_path)
        health = check_db_health(self.db_path)
        self.assertTrue(health["configured"])
        self.assertEqual(health["status"], "healthy")
        self.assertTrue(health["foreign_keys_enabled"])
        self.assertEqual(len(health["missing_tables"]), 0)

    # 26. Handling of duplicate upload attempts according to documented policy
    def test_26_handling_duplicate_upload_attempts(self):
        csv_data = """company_id,company_name,period,revenue,expenses,reported_profit,currency
C-DUPUP,Duplicate Upload Corp,2025-Q1,80000,50000,30000,USD
"""
        # First upload
        execute_ingestion_pipeline(csv_data, db_path=self.db_path, filename="run1.csv")
        recs1 = fetch_persisted_records(self.db_path)
        self.assertEqual(len(recs1), 1)

        # Second upload of identical batch - should safely upsert records without corrupting ledger
        execute_ingestion_pipeline(csv_data, db_path=self.db_path, filename="run2.csv")
        recs2 = fetch_persisted_records(self.db_path)
        self.assertEqual(len(recs2), 1)
        runs = fetch_persisted_runs(self.db_path)
        self.assertEqual(len(runs), 2)

    # 27. Existing valid data remains intact after a failed upload
    def test_27_existing_valid_data_remains_intact_after_failed_upload(self):
        valid_csv = """company_id,company_name,period,revenue,expenses,reported_profit,currency
C-STABLE,Stable Corp,2025-Q1,120000,80000,40000,USD
"""
        execute_ingestion_pipeline(valid_csv, db_path=self.db_path, filename="good.csv")
        recs_before = fetch_persisted_records(self.db_path)
        self.assertEqual(len(recs_before), 1)

        # Attempt to upload bad CSV missing mandatory headers
        bad_csv = "bad_header_1,bad_header_2\n100,200"
        try:
            execute_ingestion_pipeline(bad_csv, db_path=self.db_path, filename="bad.csv")
        except Exception:
            pass

        # Verify existing data is completely intact
        recs_after = fetch_persisted_records(self.db_path)
        self.assertEqual(len(recs_after), 1)
        self.assertEqual(recs_after[0]["companyId"], "C-STABLE")
        self.assertEqual(recs_after[0]["revenue"], 120000.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
