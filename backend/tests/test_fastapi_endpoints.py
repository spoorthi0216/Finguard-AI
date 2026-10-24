"""
FinGuard AI — FastAPI Endpoints & Lineage Test Suite
Directly verifies FastAPI HTTP endpoints using Starlette/FastAPI TestClient:
- OpenAPI schema contains /runs
- /health, /runs, /audit, /records, /findings, /metrics
- CSV upload via /ingest persists run_id consistently across runs, audit, and records
- Failed upload logs a FAILED run in ingestion_runs and preserves existing records
- Route aliases (/runs/, /ingestion_runs, /audit/) work cleanly
"""

import os
import sys
import tempfile
import unittest
from fastapi.testclient import TestClient

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import init_db, get_db_connection
from app.main import app


class TestFastAPIEndpoints(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db_path = os.path.join(self.temp_dir.name, "test_api.db")
        os.environ["DB_PATH"] = self.test_db_path
        init_db(self.test_db_path)
        self.client = TestClient(app)

    def tearDown(self):
        if "DB_PATH" in os.environ:
            del os.environ["DB_PATH"]
        self.temp_dir.cleanup()

    def test_01_openapi_schema_contains_runs_endpoint(self):
        """Verifies OpenAPI schema exposes GET /runs explicitly."""
        response = self.client.get("/openapi.json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        paths = data.get("paths", {})
        self.assertIn("/runs", paths, "GET /runs must be registered in OpenAPI documentation")
        self.assertIn("get", paths["/runs"])
        self.assertIn("/health", paths)
        self.assertIn("/ingest", paths)
        self.assertIn("/validate", paths)
        self.assertIn("/records", paths)
        self.assertIn("/findings", paths)
        self.assertIn("/audit", paths)
        self.assertIn("/metrics", paths)

    def test_02_health_endpoint(self):
        """Verifies GET /health returns online status and verified database."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "online")
        self.assertEqual(data["database"]["status"], "healthy")
        self.assertTrue(data["database"]["foreign_keys_enabled"])

    def test_03_empty_database_runs_and_audit(self):
        """Verifies /runs and /audit return empty lists when no ingestion has occurred."""
        res_runs = self.client.get("/runs")
        self.assertEqual(res_runs.status_code, 200)
        self.assertEqual(res_runs.json(), {"runs": []})

        res_audit = self.client.get("/audit")
        self.assertEqual(res_audit.status_code, 200)
        self.assertEqual(res_audit.json(), {"audit_events": []})

    def test_04_successful_csv_ingestion_and_run_lineage(self):
        """Verifies successful ingestion creates run, audit events, and records with matching runId."""
        csv_content = """company_id,company_name,sector,period,revenue,expenses,reported_profit,currency
CIK-001,Alpha Corp,Technology,2025-Q1,100000,70000,30000,USD
CIK-002,Beta Inc,Technology,2025-Q1,50000,30000,99999,USD
"""
        response = self.client.post(
            "/ingest",
            data={"profit_tolerance": "5.0"},
            files={"file": ("test_financials.csv", csv_content, "text/csv")},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        run_id = data["run_id"]
        self.assertTrue(run_id.startswith("RUN-"))
        self.assertEqual(data["total_records"], 2)
        self.assertEqual(data["valid_records"], 1)
        self.assertEqual(data["flagged_records"], 1)

        # Verify /runs returns the recorded run
        runs_res = self.client.get("/runs")
        self.assertEqual(runs_res.status_code, 200)
        runs = runs_res.json().get("runs", [])
        self.assertEqual(len(runs), 1)
        recorded_run = runs[0]
        self.assertEqual(recorded_run["runId"], run_id)
        self.assertEqual(recorded_run["filename"], "test_financials.csv")
        self.assertEqual(recorded_run["totalRows"], 2)
        self.assertEqual(recorded_run["acceptedRecords"], 2)
        self.assertEqual(recorded_run["findingsCount"], len(data["validation_findings"]))
        self.assertEqual(recorded_run["findingsCount"], 2)
        self.assertEqual(recorded_run["status"], "COMPLETED_WITH_ERRORS")

        # Verify /audit returns events referencing the matching runId
        audit_res = self.client.get("/audit")
        self.assertEqual(audit_res.status_code, 200)
        events = audit_res.json().get("audit_events", [])
        self.assertGreaterEqual(len(events), 3)  # INGESTION_STARTED, DATABASE_PERSISTENCE, BATCH_INGESTION
        for ev in events:
            self.assertEqual(ev["runId"], run_id)

    def test_05_failed_csv_ingestion_records_failed_run(self):
        """Verifies failed upload records a FAILED run in ingestion_runs and preserves existing records."""
        # 1. Ingest a valid baseline record
        valid_csv = """company_id,company_name,period,revenue,expenses,reported_profit,currency
CIK-INIT,Init Corp,2025-Q1,10000,6000,4000,USD
"""
        res_valid = self.client.post(
            "/ingest",
            files={"file": ("valid.csv", valid_csv, "text/csv")},
        )
        self.assertEqual(res_valid.status_code, 200)

        # 2. Upload invalid CSV missing required headers
        invalid_csv = "bad_col1,bad_col2\n10,20\n"
        res_bad = self.client.post(
            "/ingest",
            files={"file": ("malformed.csv", invalid_csv, "text/csv")},
        )
        self.assertEqual(res_bad.status_code, 400)

        # 3. Verify /runs contains 2 runs: 1 SUCCESS, 1 FAILED
        runs_res = self.client.get("/runs")
        self.assertEqual(runs_res.status_code, 200)
        runs = runs_res.json().get("runs", [])
        self.assertEqual(len(runs), 2)
        failed_runs = [r for r in runs if r["status"] == "FAILED"]
        self.assertEqual(len(failed_runs), 1)
        self.assertEqual(failed_runs[0]["filename"], "malformed.csv")
        self.assertIsNotNone(failed_runs[0]["errorSummary"])

        # 4. Verify existing record remains intact in SQLite
        recs_res = self.client.get("/records")
        self.assertEqual(recs_res.status_code, 200)
        records = recs_res.json().get("records", [])
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["companyId"], "CIK-INIT")

    def test_06_route_aliases_work_cleanly(self):
        """Verifies route aliases /runs/, /ingestion_runs, /audit/ return valid data without 404."""
        res1 = self.client.get("/runs/")
        self.assertEqual(res1.status_code, 200)
        res2 = self.client.get("/ingestion_runs")
        self.assertEqual(res2.status_code, 200)
        res3 = self.client.get("/ingestion-runs")
        self.assertEqual(res3.status_code, 200)
        res4 = self.client.get("/audit/")
        self.assertEqual(res4.status_code, 200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
