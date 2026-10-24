"""
FinGuard AI — Stage 3 Validation Engine & Ingestion Test Suite
Tests all 7 deterministic validation rules, CSV header normalization,
SQLite transaction persistence, and metric calculations.
"""

import os
import sys
import tempfile
import unittest
import sqlite3

# Ensure backend root is on sys.path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database import get_db_connection, init_db, check_db_health
from app.services.ingestion import read_and_normalize_csv, CSVIngestionError
from app.services.validator import FinancialValidationEngine, parse_numeric_value
from app.services.pipeline import execute_ingestion_pipeline, execute_validation_only


class TestStage3ValidationEngine(unittest.TestCase):
    def setUp(self):
        """Creates an isolated temporary SQLite database for each test."""
        self.temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db_path = self.temp_file.name
        self.temp_file.close()

    def tearDown(self):
        """Cleans up the temporary database file after each test."""
        if os.path.exists(self.temp_db_path):
            try:
                os.remove(self.temp_db_path)
            except OSError:
                pass

    # -------------------------------------------------------------------------
    # 1. Ingestion & Header Normalization Tests
    # -------------------------------------------------------------------------
    def test_01_csv_header_aliasing_and_normalization(self):
        """Verifies that common aliases (CIK, Total Revenue, OPEX, Net Income) resolve to canonical schema."""
        csv_data = """CIK,Symbol,Entity Name,Sector,Fiscal Period,Total Revenue,OPEX,Net Income
CIK-0000320193,AAPL,Apple Inc.,Technology,2024-Q1,119575,85600,33975
"""
        df, meta = read_and_normalize_csv(csv_data)
        self.assertEqual(len(df), 1)
        self.assertIn("company_id", df.columns)
        self.assertIn("revenue", df.columns)
        self.assertIn("expenses", df.columns)
        self.assertIn("reported_profit", df.columns)
        self.assertEqual(df["company_id"].iloc[0], "CIK-0000320193")

    def test_02_empty_and_malformed_csv(self):
        """Verifies that empty and malformed CSVs raise CSVIngestionError with clear codes."""
        # Empty string
        with self.assertRaises(CSVIngestionError) as ctx1:
            read_and_normalize_csv("")
        self.assertEqual(ctx1.exception.code, "EMPTY_FILE")

        # Missing mandatory company_id / period
        with self.assertRaises(CSVIngestionError) as ctx2:
            read_and_normalize_csv("revenue,expenses\n100,50")
        self.assertEqual(ctx2.exception.code, "MISSING_REQUIRED_COLUMNS")

    # -------------------------------------------------------------------------
    # 2. Deterministic Rule Tests
    # -------------------------------------------------------------------------
    def test_03_valid_records_score_100(self):
        """Verifies that clean, mathematically consistent records yield 100% DQ score."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-0000789019,MSFT,Microsoft Corporation,Technology,2024-Q1,62020.0,35000.0,27020.0
CIK-0001045810,NVDA,NVIDIA Corporation,Technology,2024-Q1,26044.0,11160.0,14884.0
"""
        result = execute_validation_only(csv_data)
        self.assertEqual(result["total_records"], 2)
        self.assertEqual(result["valid_records"], 2)
        self.assertEqual(result["flagged_records"], 0)
        self.assertEqual(result["data_quality_percentage"], 100.0)
        self.assertEqual(len(result["validation_findings"]), 0)

    def test_04_missing_required_fields(self):
        """Verifies detection of missing company_id, period, and revenue."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
,ORPH,Orphan Corp,Technology,2024-Q1,5000,4000,1000
CIK-0000200406,JNJ,Johnson & Johnson,Healthcare,2024-Q2,,17740,4686
"""
        result = execute_validation_only(csv_data)
        findings = result["validation_findings"]
        missing_rules = [f for f in findings if f["rule_id"] == "RULE_MISSING_VALUE"]
        self.assertGreaterEqual(len(missing_rules), 2)
        self.assertEqual(result["valid_records"], 0)

    def test_05_invalid_numeric_values_preserve_raw(self):
        """Verifies that non-numeric characters (footnote asterisks) are flagged while preserving raw inputs."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-0000019617,JPM,JPMorgan Chase & Co.,Financials,2024-Q2,50985,29840.50*,18140
"""
        result = execute_validation_only(csv_data)
        findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_INVALID_NUMERIC"]
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["column_name"], "expenses")
        self.assertEqual(findings[0]["affected_value"], "29840.50*")

    def test_06_supported_currency_and_comma_formatting(self):
        """Verifies that currency symbols ($) and thousands commas (119,575) parse cleanly."""
        num, ok = parse_numeric_value("$119,575.50")
        self.assertTrue(ok)
        self.assertEqual(num, 119575.50)

    def test_07_duplicate_company_period_detection(self):
        """Verifies detection of duplicate primary filings (e.g., simultaneous 10-Q and 10-Q/A)."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-0001018288,AMZN,Amazon.com Inc.,Technology,2024-Q2,147977,133300,14677
CIK-0001018288,AMZN,Amazon.com Inc.,Technology,2024-Q2,147977,135800,12177
"""
        result = execute_validation_only(csv_data)
        findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_DUPLICATE_KEY"]
        self.assertEqual(len(findings), 2)  # Both colliding rows are flagged

    def test_08_profit_reconciliation_mismatch(self):
        """Verifies mathematical profit mismatch detection: Revenue - Expenses != Reported Profit beyond tolerance."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-0000320193,AAPL,Apple Inc.,Technology,2024-Q2,90753,67100,42500
"""
        # Rev 90753 - Exp 67100 = 23653. Reported: 42500 (Discrepancy: +18847)
        result = execute_validation_only(csv_data, profit_tolerance=5.0)
        findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_MATH_PROFIT_MISMATCH"]
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "CRITICAL")
        self.assertEqual(result["records"][0]["profit_discrepancy"], 18847.0)

    def test_09_negative_expenses_and_negative_revenue(self):
        """Verifies that negative operating expenses (violating GAAP) and negative revenues are flagged."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-0000034088,XOM,Exxon Mobil Corporation,Energy,2024-Q2,93060,-71200,9240
"""
        result = execute_validation_only(csv_data)
        findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_NEGATIVE_VALUE"]
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["column_name"], "expenses")

    def test_10_statistical_outliers_as_warnings(self):
        """Verifies that statistical outliers and abnormal margins trigger soft WARNINGS, not confirmed errors."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-0001403161,V,Visa Inc.,Financials,2024-Q2,8900,450,8450
CIK-0001045810,NVDA,NVIDIA,Technology,2024-Q1,26000,11000,15000
CIK-0000018230,CAT,Caterpillar,Industrials,2024-Q1,15000,12000,3000
"""
        # Visa reported 8450 profit on 8900 revenue = 94.9% margin (> 85% threshold)
        result = execute_validation_only(csv_data)
        findings = [f for f in result["validation_findings"] if f["rule_id"] == "RULE_MARGIN_ANOMALY"]
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "WARNING")
        self.assertEqual(findings[0]["issue_type"], "UNUSUAL_VALUE")
        # Record is in ANOMALY_INVESTIGATION status
        visa_rec = [r for r in result["records"] if r["ticker"] == "V"][0]
        self.assertEqual(visa_rec["validation_status"], "ANOMALY_INVESTIGATION")

    # -------------------------------------------------------------------------
    # 3. Database Persistence & Transaction Tests
    # -------------------------------------------------------------------------
    def test_11_database_ingestion_and_retrieval(self):
        """Verifies full workflow: populating companies, financial_records, validation_findings, and audit_events."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-0000320193,AAPL,Apple Inc.,Technology,2024-Q1,119575,85600,33975
CIK-0000320193,AAPL,Apple Inc.,Technology,2024-Q2,90753,67100,42500
"""
        result = execute_ingestion_pipeline(csv_data, db_path=self.temp_db_path, run_id="RUN-TEST-INGEST")
        self.assertEqual(result["total_records"], 2)
        self.assertEqual(result["run_id"], "RUN-TEST-INGEST")

        conn = get_db_connection(self.temp_db_path)
        try:
            cursor = conn.cursor()
            # 1. Company table populated
            cursor.execute("SELECT * FROM companies WHERE company_id = 'CIK-0000320193';")
            comp = cursor.fetchone()
            self.assertIsNotNone(comp)
            self.assertEqual(comp["name"], "Apple Inc.")

            # 2. Financial records populated
            cursor.execute("SELECT COUNT(*) AS c FROM financial_records WHERE company_id = 'CIK-0000320193';")
            self.assertEqual(cursor.fetchone()["c"], 2)

            # 3. Validation findings populated (Apple Q2 math mismatch)
            cursor.execute("SELECT * FROM validation_findings WHERE rule_id = 'RULE_MATH_PROFIT_MISMATCH';")
            issue = cursor.fetchone()
            self.assertIsNotNone(issue)
            self.assertEqual(issue["severity"], "CRITICAL")

            # 4. Audit events populated
            cursor.execute("SELECT action FROM audit_events WHERE run_id = 'RUN-TEST-INGEST';")
            audit_actions = [r["action"] for r in cursor.fetchall()]
            self.assertGreaterEqual(len(audit_actions), 1)
            self.assertTrue(any(a in ["INGESTION_STARTED", "BATCH_INGESTION", "INGESTION_COMPLETED"] for a in audit_actions))
        finally:
            conn.close()

    def test_12_quality_metrics_unique_flagging_and_zero_division(self):
        """Verifies that multiple violations on one row count as 1 flagged record, and empty inputs handle zero div."""
        # Row with both duplicate key AND profit mismatch
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-0001018288,AMZN,Amazon.com Inc.,Technology,2024-Q2,147977,133300,99999
CIK-0001018288,AMZN,Amazon.com Inc.,Technology,2024-Q2,147977,133300,99999
"""
        result = execute_validation_only(csv_data)
        # Even with 4 findings total across the 2 duplicate/mismatch rows, total flagged is 2
        self.assertEqual(result["flagged_records"], 2)
        self.assertEqual(result["valid_records"], 0)
        self.assertEqual(result["data_quality_percentage"], 0.0)

        # Empty dataset check: Must return None / null when no records evaluated (never 100%)
        validator = FinancialValidationEngine()
        import pandas as pd
        _, _, empty_metrics = validator.validate_dataset(pd.DataFrame())
        self.assertIsNone(empty_metrics["data_quality_percentage"])
        self.assertIsNone(empty_metrics["record_pass_rate"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
