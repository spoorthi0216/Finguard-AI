"""
FinGuard AI — SQLite Database Unit Test Runner
Runs the test suite using standard library unittest without external packages.
Usage:
    python3 backend/test_database.py
"""

import sys
import os
import unittest

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tests.test_database import TestSQLiteDatabaseFoundation

if __name__ == "__main__":
    print("=" * 65)
    print(" Running FinGuard AI SQLite Foundation Test Suite")
    print("=" * 65)
    suite = unittest.TestLoader().loadTestsFromTestCase(TestSQLiteDatabaseFoundation)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
