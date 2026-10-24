"""
FinGuard AI — SQLite Database Unit Test Suite (Stage 2)
Tests database initialization, schema integrity, foreign-key enforcement,
and data persistence using Python's standard library unittest and sqlite3.
"""

import os
import sys
import tempfile
import unittest
import sqlite3

# Ensure backend root is on Python module search path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database import get_db_connection, init_db, check_db_health


class TestSQLiteDatabaseFoundation(unittest.TestCase):
    def setUp(self):
        """
        Creates an isolated temporary database file for each test.
        Ensures production/user data in backend/data/ is never touched.
        """
        self.temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db_path = self.temp_file.name
        self.temp_file.close()

    def tearDown(self):
        """
        Cleans up the temporary database file after each test.
        """
        if os.path.exists(self.temp_db_path):
            try:
                os.remove(self.temp_db_path)
            except OSError:
                pass

    def test_01_database_initialization_and_tables_exist(self):
        """
        Verifies that init_db() creates the 4 required tables and performance indexes.
        """
        init_db(self.temp_db_path)

        conn = get_db_connection(self.temp_db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name;
            """)
            tables = [row["name"] for row in cursor.fetchall()]

            expected_tables = ["audit_events", "companies", "financial_records", "ingestion_runs", "validation_findings"]
            for table in expected_tables:
                self.assertIn(table, tables, f"Expected table '{table}' was not created.")

            # Verify indexes exist
            cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';")
            indexes = [row["name"] for row in cursor.fetchall()]
            self.assertIn("idx_records_company", indexes)
            self.assertIn("idx_records_period", indexes)
            self.assertIn("idx_findings_record", indexes)
            self.assertIn("idx_audit_record", indexes)
        finally:
            conn.close()

    def test_02_idempotent_initialization(self):
        """
        Verifies that calling init_db() multiple times does not raise errors
        or alter existing tables.
        """
        init_db(self.temp_db_path)
        # Second call should complete safely without errors
        init_db(self.temp_db_path)

        health = check_db_health(self.temp_db_path)
        self.assertEqual(health["status"], "healthy")
        self.assertEqual(len(health["missing_tables"]), 0)

    def test_03_foreign_key_enforcement(self):
        """
        Verifies that SQLite foreign key enforcement is strictly active (PRAGMA foreign_keys = ON).
        Attempting to insert a financial_record referencing a non-existent company MUST fail.
        """
        init_db(self.temp_db_path)
        conn = get_db_connection(self.temp_db_path)

        try:
            # 1. Attempt to insert record with non-existent company_id
            with self.assertRaises(sqlite3.IntegrityError):
                with conn:
                    conn.execute("""
                        INSERT INTO financial_records (
                            id, company_id, period, revenue, expenses, reported_profit,
                            calculated_profit, profit_discrepancy, validation_status
                        ) VALUES (
                            'rec-orphan-01', 'NON_EXISTENT_CIK', '2024-Q1', 1000.0, 800.0, 200.0,
                            200.0, 0.0, 'VALID'
                        );
                    """)
        finally:
            conn.close()

    def test_04_data_insertion_and_retrieval(self):
        """
        Verifies that records can be inserted into companies, financial_records,
        validation_findings, and audit_events, and retrieved accurately.
        """
        init_db(self.temp_db_path)
        conn = get_db_connection(self.temp_db_path)

        try:
            with conn:
                # 1. Insert parent company
                conn.execute("""
                    INSERT INTO companies (company_id, ticker, name, sector)
                    VALUES ('CIK-0000320193', 'AAPL', 'Apple Inc.', 'Technology');
                """)

                # 2. Insert financial record
                conn.execute("""
                    INSERT INTO financial_records (
                        id, company_id, period, revenue, expenses, reported_profit,
                        calculated_profit, profit_discrepancy, validation_status, raw_payload
                    ) VALUES (
                        'rec-1-AAPL', 'CIK-0000320193', '2024-Q2', 90753.0, 67100.0, 42500.0,
                        23653.0, 18847.0, 'CRITICAL_FAILURE', '{"rawRev": 90753}'
                    );
                """)

                # 3. Insert validation finding referencing the record
                conn.execute("""
                    INSERT INTO validation_findings (
                        id, record_id, rule_id, rule_name, severity, issue_type,
                        affected_value, expected_value, status
                    ) VALUES (
                        'issue-2-math', 'rec-1-AAPL', 'RULE_MATH_PROFIT_MISMATCH',
                        'Profit Arithmetic Reconciliation', 'CRITICAL', 'CONFIRMED_FAILURE',
                        '42500.0', '23653.0', 'OPEN'
                    );
                """)

                # 4. Insert audit event referencing the record
                conn.execute("""
                    INSERT INTO audit_events (
                        id, run_id, record_id, action, field_name, before_value,
                        after_value, justification
                    ) VALUES (
                        'audit-101', 'RUN-TEST-01', 'rec-1-AAPL', 'RECORD_CORRECTION',
                        'reported_profit', '42500.0', '23653.0', 'Reconciled to revenue - expenses'
                    );
                """)

            # Query and verify
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM companies WHERE company_id = 'CIK-0000320193';")
            company = cursor.fetchone()
            self.assertIsNotNone(company)
            self.assertEqual(company["ticker"], "AAPL")
            self.assertEqual(company["sector"], "Technology")

            cursor.execute("SELECT * FROM financial_records WHERE id = 'rec-1-AAPL';")
            rec = cursor.fetchone()
            self.assertIsNotNone(rec)
            self.assertEqual(rec["revenue"], 90753.0)
            self.assertEqual(rec["profit_discrepancy"], 18847.0)

            cursor.execute("SELECT * FROM validation_findings WHERE record_id = 'rec-1-AAPL';")
            finding = cursor.fetchone()
            self.assertIsNotNone(finding)
            self.assertEqual(finding["rule_id"], "RULE_MATH_PROFIT_MISMATCH")

            cursor.execute("SELECT * FROM audit_events WHERE record_id = 'rec-1-AAPL';")
            audit = cursor.fetchone()
            self.assertIsNotNone(audit)
            self.assertEqual(audit["field_name"], "reported_profit")
        finally:
            conn.close()

    def test_05_persistence_across_connection_close_and_reopen(self):
        """
        Verifies that data written to the SQLite database remains intact on disk
        after explicitly closing and reopening a connection.
        """
        init_db(self.temp_db_path)

        # Connection 1: Insert data and close
        conn1 = get_db_connection(self.temp_db_path)
        with conn1:
            conn1.execute("""
                INSERT INTO companies (company_id, ticker, name, sector)
                VALUES ('CIK-0000789019', 'MSFT', 'Microsoft Corporation', 'Technology');
            """)
            conn1.execute("""
                INSERT INTO financial_records (
                    id, company_id, period, revenue, expenses, reported_profit,
                    calculated_profit, profit_discrepancy, validation_status
                ) VALUES (
                    'rec-msft-01', 'CIK-0000789019', '2024-Q1', 62020.0, 35000.0, 27020.0,
                    27020.0, 0.0, 'VALID'
                );
            """)
        conn1.close()

        # Connection 2: Open fresh connection and query
        conn2 = get_db_connection(self.temp_db_path)
        try:
            cursor = conn2.cursor()
            cursor.execute("SELECT ticker, name FROM companies WHERE company_id = 'CIK-0000789019';")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["ticker"], "MSFT")
            self.assertEqual(row["name"], "Microsoft Corporation")

            cursor.execute("SELECT revenue, calculated_profit FROM financial_records WHERE id = 'rec-msft-01';")
            record_row = cursor.fetchone()
            self.assertIsNotNone(record_row)
            self.assertEqual(record_row["revenue"], 62020.0)
            self.assertEqual(record_row["calculated_profit"], 27020.0)
        finally:
            conn2.close()

    def test_06_health_check_function(self):
        """
        Verifies that check_db_health() accurately verifies database connection,
        scalar query, table inventory, and foreign key status.
        """
        init_db(self.temp_db_path)
        health = check_db_health(self.temp_db_path)

        self.assertTrue(health["configured"])
        self.assertEqual(health["status"], "healthy")
        self.assertTrue(health["foreign_keys_enabled"])
        self.assertEqual(len(health["missing_tables"]), 0)
        self.assertIn("companies", health["tables"])
        self.assertIn("financial_records", health["tables"])
        self.assertIn("validation_findings", health["tables"])
        self.assertIn("audit_events", health["tables"])
        self.assertIn("ingestion_runs", health["tables"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
