"""
FinGuard AI — Stage 4.1 Comprehensive Regression Test Suite
Validates:
1. Sector statistics: Evaluated counts, valid/flagged, pass rate formula, empty sectors return None (never 100%), missing sector mapped to Unassigned.
2. Prevention of duplicate record counts from joins.
3. Financial currency & unit correctness: multi-currency preservation (EUR, GBP, USD, INR), missing currency as None, no silent scaling.
4. Evidence-based findings: finding ID and record ID attribution, distinction between confirmed failures and soft anomalies.
5. Record pass rate consistency and zero-record handling.
6. SQLite persistence and schema integrity.
"""

import os
import sys
import unittest
import tempfile
import pandas as pd

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import init_db, get_db_connection
from app.services.ingestion import read_and_normalize_csv
from app.services.validator import FinancialValidationEngine
from app.services.pipeline import (
    execute_ingestion_pipeline,
    execute_validation_only,
    fetch_persisted_records,
    fetch_persisted_metrics,
    fetch_persisted_findings,
)


class TestStage41RegressionSuite(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_stage4_1.db")
        init_db(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    # =========================================================================
    # 1. SECTOR METRICS & DUPLICATE PREVENTION
    # =========================================================================
    def test_01_sector_statistics_calculation_and_pass_rate(self):
        """Verifies sector statistics: total, valid, flagged, and exact pass rate."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-001,TECH1,Tech Corp One,Technology,2024-Q1,10000,7000,3000
CIK-002,TECH2,Tech Corp Two,Technology,2024-Q1,20000,15000,99999
CIK-003,HLTH1,Health Corp One,Healthcare,2024-Q1,50000,40000,10000
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        metrics = fetch_persisted_metrics(self.db_path)
        sector_breakdown = metrics["sectorBreakdown"]

        # Technology: 2 evaluated, 1 valid (TECH1), 1 flagged (TECH2 math mismatch) -> 50.0%
        tech = sector_breakdown.get("Technology")
        self.assertIsNotNone(tech)
        self.assertEqual(tech["count"], 2)
        self.assertEqual(tech["validCount"], 1)
        self.assertEqual(tech["flaggedCount"], 1)
        self.assertEqual(tech["passRate"], 50.0)

        # Healthcare: 1 evaluated, 1 valid -> 100.0%
        health = sector_breakdown.get("Healthcare")
        self.assertIsNotNone(health)
        self.assertEqual(health["count"], 1)
        self.assertEqual(health["validCount"], 1)
        self.assertEqual(health["flaggedCount"], 0)
        self.assertEqual(health["passRate"], 100.0)

    def test_02_empty_sector_handling_never_displays_100_percent(self):
        """Verifies sectors with zero records return None / null passRate, never 100.0%."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-001,TECH1,Tech Corp One,Technology,2024-Q1,10000,7000,3000
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        metrics = fetch_persisted_metrics(self.db_path)
        sector_breakdown = metrics["sectorBreakdown"]

        # Financials, Energy, Consumer, Industrials have 0 records -> passRate must be None
        for empty_sec in ["Financials", "Energy", "Consumer", "Industrials"]:
            sec_data = sector_breakdown.get(empty_sec)
            self.assertIsNotNone(sec_data, f"Sector {empty_sec} should be represented in breakdown")
            self.assertEqual(sec_data["count"], 0)
            self.assertEqual(sec_data["validCount"], 0)
            self.assertEqual(sec_data["flaggedCount"], 0)
            self.assertIsNone(sec_data["passRate"], f"Empty sector {empty_sec} must have None passRate, not 100%")

    def test_03_missing_sector_transparently_mapped_to_unassigned(self):
        """Verifies records with empty or null sector are grouped under 'Unassigned', not fabricated."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-NOSEC,NOSEC,No Sector Entity,,2024-Q1,15000,10000,5000
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        metrics = fetch_persisted_metrics(self.db_path)
        sector_breakdown = metrics["sectorBreakdown"]

        unassigned = sector_breakdown.get("Unassigned")
        self.assertIsNotNone(unassigned, "Missing sector must be grouped under 'Unassigned'")
        self.assertEqual(unassigned["count"], 1)
        self.assertEqual(unassigned["validCount"], 1)
        self.assertEqual(unassigned["flaggedCount"], 0)
        self.assertEqual(unassigned["passRate"], 100.0)

    def test_04_prevention_of_duplicate_counts_from_multiple_findings(self):
        """Verifies multiple validation findings on a single record count as only 1 evaluated and 1 flagged record."""
        # Row with negative expenses AND profit reconciliation mismatch
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-MULTI,MULTI,Multi Violation Corp,Financials,2024-Q1,10000,-5000,99999
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        metrics = fetch_persisted_metrics(self.db_path)
        sector_breakdown = metrics["sectorBreakdown"]

        # Total record count is 1, not 2
        self.assertEqual(metrics["totalRecords"], 1)
        self.assertEqual(metrics["flaggedRecords"], 1)
        self.assertEqual(metrics["validRecords"], 0)
        self.assertEqual(metrics["recordPassRate"], 0.0)

        # Sector count is also 1, not inflated by findings
        fin = sector_breakdown.get("Financials")
        self.assertEqual(fin["count"], 1)
        self.assertEqual(fin["flaggedCount"], 1)
        self.assertEqual(fin["validCount"], 0)
        self.assertEqual(fin["passRate"], 0.0)

        # Findings table has multiple findings for this single record
        findings = fetch_persisted_findings(self.db_path)
        self.assertGreaterEqual(len(findings), 2, "Record has multiple rule violations")

    # =========================================================================
    # 2. FINANCIAL UNITS & CURRENCY
    # =========================================================================
    def test_05_currency_preservation_and_missing_currency(self):
        """Verifies original currencies (EUR, GBP, INR, USD) are preserved and missing currency is None."""
        csv_data = """company_id,ticker,company_name,period,currency,revenue,expenses,reported_profit
CIK-EUR,EURCO,Euro Holdings,2024-Q1,EUR,100000,70000,30000
CIK-GBP,GBPCO,British Trading,2024-Q1,GBP,50000,35000,15000
CIK-INR,INRCO,India Enterprise,2024-Q1,INR,800000,600000,200000
CIK-NOCURR,NOCURR,No Currency Corp,2024-Q1,,25000,20000,5000
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        persisted = fetch_persisted_records(self.db_path)
        curr_map = {r["companyId"]: r["currency"] for r in persisted}

        self.assertEqual(curr_map["CIK-EUR"], "EUR")
        self.assertEqual(curr_map["CIK-GBP"], "GBP")
        self.assertEqual(curr_map["CIK-INR"], "INR")
        self.assertIsNone(curr_map["CIK-NOCURR"], "Missing currency must be stored as None, not defaulted to USD")

    def test_06_numeric_precision_preservation_no_silent_scaling(self):
        """Verifies exact precision of financial amounts without rounding, multiplying, or dividing."""
        csv_data = """company_id,ticker,company_name,period,revenue,expenses,reported_profit
CIK-PREC,PREC,Precision Corp,2024-Q1,119575.45,85600.20,33975.25
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        persisted = fetch_persisted_records(self.db_path)
        r = persisted[0]

        self.assertAlmostEqual(r["revenue"], 119575.45, places=2)
        self.assertAlmostEqual(r["expenses"], 85600.20, places=2)
        self.assertAlmostEqual(r["reportedProfit"], 33975.25, places=2)
        self.assertAlmostEqual(r["calculatedProfit"], 33975.25, places=2)
        self.assertAlmostEqual(r["profitDiscrepancy"], 0.0, places=2)
        self.assertEqual(r["validationStatus"], "VALID")

    def test_07_currency_breakdown_in_metrics(self):
        """Verifies currency breakdown aggregates separate totals per currency."""
        csv_data = """company_id,ticker,company_name,period,currency,revenue,expenses,reported_profit
CIK-EUR,EURCO,Euro Holdings,2024-Q1,EUR,100000,70000,30000
CIK-USD,USDCO,US Holdings,2024-Q1,USD,200000,150000,50000
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        metrics = fetch_persisted_metrics(self.db_path)
        c_breakdown = metrics.get("currencyBreakdown") or metrics.get("currency_breakdown")

        self.assertIsNotNone(c_breakdown)
        self.assertIn("EUR", c_breakdown)
        self.assertIn("USD", c_breakdown)
        self.assertEqual(c_breakdown["EUR"]["revenue"], 100000.0)
        self.assertEqual(c_breakdown["USD"]["revenue"], 200000.0)

    # =========================================================================
    # 3. EVIDENCE-BASED VALIDATION FINDINGS & RECORD ATTRIBUTION
    # =========================================================================
    def test_08_finding_attribution_and_lineage(self):
        """Verifies every finding has an ID, record_id, rule_id, severity, and affected_value."""
        csv_data = """company_id,ticker,company_name,sector,period,revenue,expenses,reported_profit
CIK-EVID,EVID,Evidence Corp,Technology,2024-Q1,10000,8000,99999
"""
        execute_ingestion_pipeline(csv_data, db_path=self.db_path)
        findings = fetch_persisted_findings(self.db_path)
        self.assertGreaterEqual(len(findings), 1)

        # Locate the confirmed mathematical failure
        math_findings = [f for f in findings if f["rule_id"] == "RULE_MATH_PROFIT_MISMATCH"]
        self.assertEqual(len(math_findings), 1)
        f = math_findings[0]
        self.assertTrue(bool(f["id"]))
        self.assertTrue(f["record_id"].startswith("rec-"))
        self.assertEqual(f["rule_id"], "RULE_MATH_PROFIT_MISMATCH")
        self.assertEqual(f["severity"], "CRITICAL")
        self.assertEqual(f["issue_type"], "CONFIRMED_FAILURE")
        self.assertEqual(f["company_id"], "CIK-EVID")
        self.assertEqual(f["ticker"], "EVID")

        # Verify all findings have valid lineage referencing the evaluated record
        for finding in findings:
            self.assertTrue(bool(finding["id"]))
            self.assertTrue(finding["record_id"].startswith("rec-"))
            self.assertIn(finding["issue_type"], ["CONFIRMED_FAILURE", "UNUSUAL_VALUE", "METHODOLOGY_NOTE", "POSSIBLE_ANOMALY"])


    def test_09_empty_dataset_returns_none_pass_rate(self):
        """Verifies zero evaluated records produces None pass rate and empty findings."""
        validator = FinancialValidationEngine()
        records, findings, metrics = validator.validate_dataset(pd.DataFrame())

        self.assertEqual(len(records), 0)
        self.assertEqual(len(findings), 0)
        self.assertEqual(metrics["total_records"], 0)
        self.assertIsNone(metrics["record_pass_rate"])
        self.assertIsNone(metrics["data_quality_percentage"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
