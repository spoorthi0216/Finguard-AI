"""
FinGuard AI — Stage 3 Validation Engine Test Runner
Runs Stage 3 tests using Python unittest.
Usage:
    python3 backend/test_stage3.py
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tests.test_validation_engine import TestStage3ValidationEngine

if __name__ == "__main__":
    print("=" * 65)
    print(" Running FinGuard AI Stage 3 Validation Engine Tests")
    print("=" * 65)
    suite = unittest.TestLoader().loadTestsFromTestCase(TestStage3ValidationEngine)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
