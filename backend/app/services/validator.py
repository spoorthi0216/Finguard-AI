"""
FinGuard AI — Deterministic Validation Engine (Stage 3)
Implements vectorized data quality rules across financial statement filings:
1. Missing required fields
2. Invalid numeric values (handling currency & commas explicitly)
3. Duplicate company_id and period combinations
4. Negative revenue or expenses
5. Profit reconciliation (Revenue - Expenses = Calculated Profit)
6. Statistical outliers (Z-scores & implausible margins as soft warnings)
7. Reporting-period format checks
"""

import math
import re
from typing import Dict, List, Tuple, Any, Optional
import numpy as np
import pandas as pd


# Default mathematical tolerance in millions USD to accommodate SEC rounding
DEFAULT_PROFIT_TOLERANCE_MILLIONS = 5.0

# Standard fiscal reporting period regex (e.g., 2024-Q1, 2024-Q4, 2023-FY)
PERIOD_REGEX = re.compile(r"^\d{4}-(Q[1-4]|FY|10K|10Q)$", re.IGNORECASE)


def parse_numeric_value(raw_val: Any) -> Tuple[Optional[float], bool]:
    """
    Parses a numeric value explicitly preserving the original string.
    
    Supported formats handled cleanly:
    - Currency symbols: $, €, £
    - Thousands separators: commas (e.g., "119,575.00")
    - Whitespace trimming
    
    Returns: (parsed_float_or_none, is_valid_syntax)
    If non-numeric characters exist (e.g., footnote asterisks '29,840.50*', letters),
    it returns (None, False) to flag the value without silent truncation.
    """
    if raw_val is None:
        return None, True  # Empty/null handled by missing-value check

    val_str = str(raw_val).strip()
    if val_str == "" or val_str.lower() in ("nan", "null", "none"):
        return None, True

    # Strip supported currency symbols and thousands separators explicitly
    cleaned = re.sub(r"[\$€£]", "", val_str).replace(",", "").strip()

    # Strict check: only digits, optional single decimal point, and optional leading minus
    if not re.match(r"^-?\d+(\.\d+)?$", cleaned):
        return None, False

    try:
        num = float(cleaned)
        if math.isnan(num) or math.isinf(num):
            return None, False
        return num, True
    except ValueError:
        return None, False


class FinancialValidationEngine:
    """
    Vectorized deterministic validator for SEC financial filings.
    Assumptions for Profit Reconciliation:
    - Single-step operating formula: Calculated Profit = Revenue - Operating Expenses.
    - Tolerance buffer (default: $5.0M) accounts for minor decimal roundings in SEC XBRL tags.
    - Discrepancies exceeding the tolerance indicate unmapped non-operating footnotes,
      discontinued operations, or accounting misclassifications.
    """

    def __init__(self, profit_tolerance: float = DEFAULT_PROFIT_TOLERANCE_MILLIONS):
        self.profit_tolerance = profit_tolerance

    def validate_dataset(self, df: pd.DataFrame) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
        """
        Executes all validation rules across the DataFrame.
        Returns: (validated_records, validation_findings, quality_metrics)
        """
        total_records = len(df)
        if total_records == 0:
            return [], [], {
                "total_records": 0,
                "valid_records": 0,
                "flagged_records": 0,
                "confirmed_failures": 0,
                "unusual_values": 0,
                "record_pass_rate": None,
                "data_quality_percentage": None,
                "validity_method": "PER_RECORD",
                "sector_breakdown": {
                    s: {"count": 0, "valid_count": 0, "flagged_count": 0, "pass_rate": None, "revenue": 0.0}
                    for s in ["Technology", "Financials", "Healthcare", "Energy", "Consumer", "Industrials"]
                },
            }

        findings: List[Dict[str, Any]] = []
        record_has_critical_failure = np.zeros(total_records, dtype=bool)
        record_has_warning = np.zeros(total_records, dtype=bool)

        # -----------------------------------------------------------------
        # 1. Parse and sanitize numerical columns
        # -----------------------------------------------------------------
        parsed_rev = []
        rev_syntax_valid = []
        parsed_exp = []
        exp_syntax_valid = []
        parsed_prof = []
        prof_syntax_valid = []

        for _, row in df.iterrows():
            r, r_ok = parse_numeric_value(row.get("revenue"))
            parsed_rev.append(r)
            rev_syntax_valid.append(r_ok)

            e, e_ok = parse_numeric_value(row.get("expenses"))
            parsed_exp.append(e)
            exp_syntax_valid.append(e_ok)

            p, p_ok = parse_numeric_value(row.get("reported_profit"))
            parsed_prof.append(p)
            prof_syntax_valid.append(p_ok)

        df["parsed_revenue"] = parsed_rev
        df["parsed_expenses"] = parsed_exp
        df["parsed_reported_profit"] = parsed_prof

        # -----------------------------------------------------------------
        # 2. Vectorized Duplicate Key Detection (company_id + period)
        # -----------------------------------------------------------------
        # Normalizes company_id and period for duplicate comparison
        normalized_keys = df["company_id"].astype(str).str.strip().str.upper() + "::" + df["period"].astype(str).str.strip().str.upper()
        is_duplicate = normalized_keys.duplicated(keep=False) & (df["company_id"].astype(str).str.strip() != "")

        # -----------------------------------------------------------------
        # 3. Vectorized Statistical Outlier Baseline
        # -----------------------------------------------------------------
        valid_rev_series = pd.Series([r for r in parsed_rev if r is not None and r > 0], dtype=float)
        rev_mean = float(valid_rev_series.mean()) if len(valid_rev_series) > 0 else 50000.0
        rev_std = float(valid_rev_series.std()) if len(valid_rev_series) > 1 else 25000.0
        rev_std = rev_std if rev_std > 0 else 25000.0

        validated_records: List[Dict[str, Any]] = []

        # -----------------------------------------------------------------
        # 4. Iterate and apply deterministic rules per row
        # -----------------------------------------------------------------
        for idx, row in df.iterrows():
            row_num = int(row.get("row_number", idx + 1))
            raw_cid = row.get("company_id")
            company_id = str(raw_cid).strip() if (raw_cid is not None and not pd.isna(raw_cid) and str(raw_cid).strip() != "" and str(raw_cid).strip().lower() not in ("nan", "none")) else ""

            raw_t = row.get("ticker")
            ticker = str(raw_t).strip() if (raw_t is not None and not pd.isna(raw_t) and str(raw_t).strip() != "" and str(raw_t).strip().lower() not in ("nan", "none", "unknown")) else None

            raw_name = row.get("company_name")
            company_name = str(raw_name).strip() if (raw_name is not None and not pd.isna(raw_name) and str(raw_name).strip() != "" and str(raw_name).strip().lower() not in ("nan", "none", "unknown corp", "unknown entity")) else None

            raw_sec = row.get("sector")
            sector = str(raw_sec).strip() if (raw_sec is not None and not pd.isna(raw_sec) and str(raw_sec).strip() != "" and str(raw_sec).strip().lower() not in ("nan", "none")) else None

            raw_per = row.get("period")
            period = str(raw_per).strip() if (raw_per is not None and not pd.isna(raw_per) and str(raw_per).strip() != "" and str(raw_per).strip().lower() not in ("nan", "none")) else ""

            entity_tag = ticker or (company_id if company_id else f"ROW{row_num}")
            clean_period = re.sub(r"[^a-zA-Z0-9]+", "", period) if period else ""
            period_tag = f"-{clean_period}" if clean_period else ""
            record_id = f"rec-{row_num}-{entity_tag}{period_tag}"

            rev = parsed_rev[idx]
            exp = parsed_exp[idx]
            prof = parsed_prof[idx]

            raw_rev = str(row.get("raw_revenue", row.get("revenue", "")))
            raw_exp = str(row.get("raw_expenses", row.get("expenses", "")))
            raw_prof = str(row.get("raw_reported_profit", row.get("reported_profit", "")))

            # Rule 1: Missing Required Identifiers
            if not company_id:
                findings.append({
                    "id": f"issue-{row_num}-missing-company-id",
                    "record_id": record_id,
                    "rule_id": "RULE_MISSING_VALUE",
                    "rule_name": "Mandatory Company Identifier",
                    "severity": "CRITICAL",
                    "issue_type": "CONFIRMED_FAILURE",
                    "column_name": "company_id",
                    "affected_value": "NULL / Empty",
                    "expected_value": "Valid CIK or LEI string",
                    "status": "OPEN",
                })
                record_has_critical_failure[idx] = True

            if not period:
                findings.append({
                    "id": f"issue-{row_num}-missing-period",
                    "record_id": record_id,
                    "rule_id": "RULE_MISSING_VALUE",
                    "rule_name": "Mandatory Reporting Period",
                    "severity": "CRITICAL",
                    "issue_type": "CONFIRMED_FAILURE",
                    "column_name": "period",
                    "affected_value": "NULL / Empty",
                    "expected_value": "Fiscal period (e.g. 2024-Q1)",
                    "status": "OPEN",
                })
                record_has_critical_failure[idx] = True
            elif not PERIOD_REGEX.match(period):
                # Rule 7: Invalid Reporting Period Format
                findings.append({
                    "id": f"issue-{row_num}-invalid-period-format",
                    "record_id": record_id,
                    "rule_id": "RULE_INVALID_PERIOD_FORMAT",
                    "rule_name": "Standard Fiscal Period Format",
                    "severity": "WARNING",
                    "issue_type": "UNUSUAL_VALUE",
                    "column_name": "period",
                    "affected_value": period,
                    "expected_value": "YYYY-Q[1-4] or YYYY-FY (e.g. 2024-Q2)",
                    "status": "OPEN",
                })
                record_has_warning[idx] = True

            # Rule 3: Duplicate Company-Period Key Collision
            if is_duplicate.iloc[idx]:
                findings.append({
                    "id": f"issue-{row_num}-duplicate-key",
                    "record_id": record_id,
                    "rule_id": "RULE_DUPLICATE_KEY",
                    "rule_name": "Composite Key Uniqueness (company_id + period)",
                    "severity": "CRITICAL",
                    "issue_type": "CONFIRMED_FAILURE",
                    "column_name": "period",
                    "affected_value": f"{company_id}::{period}",
                    "expected_value": "Unique primary filing tuple in ingestion batch",
                    "status": "OPEN",
                })
                record_has_critical_failure[idx] = True

            # Rule 2: Invalid Numeric Values (Syntax artifacts, footnote asterisks)
            if not rev_syntax_valid[idx]:
                findings.append({
                    "id": f"issue-{row_num}-invalid-num-revenue",
                    "record_id": record_id,
                    "rule_id": "RULE_INVALID_NUMERIC",
                    "rule_name": "Numeric Format Integrity (Revenue)",
                    "severity": "CRITICAL",
                    "issue_type": "CONFIRMED_FAILURE",
                    "column_name": "revenue",
                    "affected_value": raw_rev,
                    "expected_value": "Numeric float without footnote artifacts",
                    "status": "OPEN",
                })
                record_has_critical_failure[idx] = True

            if not exp_syntax_valid[idx]:
                findings.append({
                    "id": f"issue-{row_num}-invalid-num-expenses",
                    "record_id": record_id,
                    "rule_id": "RULE_INVALID_NUMERIC",
                    "rule_name": "Numeric Format Integrity (Expenses)",
                    "severity": "CRITICAL",
                    "issue_type": "CONFIRMED_FAILURE",
                    "column_name": "expenses",
                    "affected_value": raw_exp,
                    "expected_value": "Numeric float without footnote artifacts",
                    "status": "OPEN",
                })
                record_has_critical_failure[idx] = True

            if not prof_syntax_valid[idx]:
                findings.append({
                    "id": f"issue-{row_num}-invalid-num-profit",
                    "record_id": record_id,
                    "rule_id": "RULE_INVALID_NUMERIC",
                    "rule_name": "Numeric Format Integrity (Reported Profit)",
                    "severity": "CRITICAL",
                    "issue_type": "CONFIRMED_FAILURE",
                    "column_name": "reported_profit",
                    "affected_value": raw_prof,
                    "expected_value": "Numeric float",
                    "status": "OPEN",
                })
                record_has_critical_failure[idx] = True

            # Rule 1 (part 2): Missing Numeric Financial Fields
            if rev is None and rev_syntax_valid[idx]:
                findings.append({
                    "id": f"issue-{row_num}-missing-revenue",
                    "record_id": record_id,
                    "rule_id": "RULE_MISSING_VALUE",
                    "rule_name": "Non-Null Revenue Constraint",
                    "severity": "CRITICAL",
                    "issue_type": "CONFIRMED_FAILURE",
                    "column_name": "revenue",
                    "affected_value": "NULL / Empty",
                    "expected_value": "Float value > 0",
                    "status": "OPEN",
                })
                record_has_critical_failure[idx] = True

            # Rule 4: Negative Revenue or Expenses
            if rev is not None and rev < 0:
                findings.append({
                    "id": f"issue-{row_num}-negative-revenue",
                    "record_id": record_id,
                    "rule_id": "RULE_NEGATIVE_VALUE",
                    "rule_name": "Non-Negative Revenue Constraint",
                    "severity": "CRITICAL",
                    "issue_type": "CONFIRMED_FAILURE",
                    "column_name": "revenue",
                    "affected_value": f"${rev:,.2f}M",
                    "expected_value": "Positive gross revenue figure",
                    "status": "OPEN",
                })
                record_has_critical_failure[idx] = True

            if exp is not None and exp < 0:
                findings.append({
                    "id": f"issue-{row_num}-negative-expenses",
                    "record_id": record_id,
                    "rule_id": "RULE_NEGATIVE_VALUE",
                    "rule_name": "Positive Operating Expense Constraint",
                    "severity": "CRITICAL",
                    "issue_type": "CONFIRMED_FAILURE",
                    "column_name": "expenses",
                    "affected_value": f"${exp:,.2f}M",
                    "expected_value": "Positive cost basis (GAAP operating expense)",
                    "status": "OPEN",
                })
                record_has_critical_failure[idx] = True

            # Rule 5: Profit Reconciliation (Revenue - Expenses = Calculated Profit)
            calc_profit = None
            profit_discrepancy = None
            operating_margin = None

            if rev is not None and exp is not None:
                calc_profit = round(rev - exp, 2)
                if prof is not None:
                    profit_discrepancy = round(prof - calc_profit, 2)
                    if abs(profit_discrepancy) > self.profit_tolerance:
                        findings.append({
                            "id": f"issue-{row_num}-profit-mismatch",
                            "record_id": record_id,
                            "rule_id": "RULE_MATH_PROFIT_MISMATCH",
                            "rule_name": "Profit Arithmetic Reconciliation",
                            "severity": "CRITICAL",
                            "issue_type": "CONFIRMED_FAILURE",
                            "column_name": "reported_profit",
                            "affected_value": f"${prof:,.2f}M",
                            "expected_value": f"${calc_profit:,.2f}M (Revenue - Expenses)",
                            "status": "OPEN",
                        })
                        record_has_critical_failure[idx] = True

            if rev is not None and prof is not None and rev > 0:
                operating_margin = round((prof / rev) * 100, 1)

            # Rule 6: Statistical Outliers (Soft Warnings, NOT Confirmed Failures)
            if rev is not None and rev > 0 and len(valid_rev_series) > 2:
                z_score = (rev - rev_mean) / rev_std
                if z_score > 2.5 and rev > 100000.0:
                    findings.append({
                        "id": f"issue-{row_num}-statistical-outlier",
                        "record_id": record_id,
                        "rule_id": "RULE_STATISTICAL_OUTLIER",
                        "rule_name": "Statistical Distribution Outlier (Z-Score > 2.5)",
                        "severity": "WARNING",
                        "issue_type": "UNUSUAL_VALUE",
                        "column_name": "revenue",
                        "affected_value": f"${rev:,.2f}M (Z={z_score:.2f})",
                        "expected_value": f"Batch mean ${rev_mean:,.0f}M (±2.5σ)",
                        "status": "OPEN",
                    })
                    record_has_warning[idx] = True

            if operating_margin is not None and operating_margin > 85.0:
                findings.append({
                    "id": f"issue-{row_num}-margin-anomaly",
                    "record_id": record_id,
                    "rule_id": "RULE_MARGIN_ANOMALY",
                    "rule_name": "Operating Margin Outlier (> 85%)",
                    "severity": "WARNING",
                    "issue_type": "UNUSUAL_VALUE",
                    "column_name": "reported_profit",
                    "affected_value": f"{operating_margin}%",
                    "expected_value": "Expected margin range: 5% - 50%",
                    "status": "OPEN",
                })
                record_has_warning[idx] = True

            # Determine final status for this record
            if record_has_critical_failure[idx]:
                status = "CRITICAL_FAILURE"
            elif record_has_warning[idx]:
                status = "ANOMALY_INVESTIGATION"
            else:
                status = "VALID"

            raw_curr = row.get("currency")
            currency = str(raw_curr).strip().upper() if (raw_curr is not None and not pd.isna(raw_curr) and str(raw_curr).strip() != "" and str(raw_curr).strip().lower() not in ("nan", "none", "null")) else None

            validated_records.append({
                "id": record_id,
                "company_id": company_id if company_id else None,
                "ticker": ticker,
                "company_name": company_name,
                "sector": sector,
                "period": period if period else None,
                "filing_date": str(row.get("filing_date", "2024-01-01")),
                "currency": currency,
                "revenue": rev,
                "expenses": exp,
                "reported_profit": prof,
                "calculated_profit": calc_profit,
                "profit_discrepancy": profit_discrepancy,
                "operating_margin": operating_margin,
                "ebitda": float(row.get("ebitda", 0.0)) if str(row.get("ebitda", "")).replace(".", "").isdigit() else 0.0,
                "credit_rating": str(row.get("credit_rating", "BBB")) if row.get("credit_rating") else None,
                "validation_status": status,
                "raw_payload": {
                    "raw_revenue": raw_rev,
                    "raw_expenses": raw_exp,
                    "raw_reported_profit": raw_prof,
                    "currency": currency,
                    "sector": sector,
                    "row_number": row_num,
                },
            })

        # -----------------------------------------------------------------
        # 5. Calculate Standardized Data Quality Metrics
        # -----------------------------------------------------------------
        # Valid records are those that pass all mandatory/critical checks
        valid_records = int(np.sum(~record_has_critical_failure))
        flagged_records = total_records - valid_records
        confirmed_failures = int(np.sum(record_has_critical_failure))
        unusual_values = int(np.sum(record_has_warning & ~record_has_critical_failure))

        pass_rate = round((valid_records / total_records) * 100.0, 1) if total_records > 0 else None

        # Calculate sector breakdown from evaluated records
        predefined_sectors = ["Technology", "Financials", "Healthcare", "Energy", "Consumer", "Industrials"]
        sector_counts: Dict[str, Dict[str, Any]] = {
            s: {"count": 0, "valid_count": 0, "flagged_count": 0, "pass_rate": None, "revenue": 0.0}
            for s in predefined_sectors
        }

        for rec in validated_records:
            sec = rec.get("sector")
            sec_name = sec.strip() if (sec and str(sec).strip() and str(sec).strip().lower() not in ("nan", "none")) else "Unassigned"
            if sec_name not in sector_counts:
                sector_counts[sec_name] = {"count": 0, "valid_count": 0, "flagged_count": 0, "pass_rate": None, "revenue": 0.0}
            sector_counts[sec_name]["count"] += 1
            if rec.get("validation_status") == "VALID":
                sector_counts[sec_name]["valid_count"] += 1
            else:
                sector_counts[sec_name]["flagged_count"] += 1
            if rec.get("revenue") is not None:
                sector_counts[sec_name]["revenue"] += round(rec["revenue"], 2)

        for s_data in sector_counts.values():
            if s_data["count"] > 0:
                s_data["pass_rate"] = round((s_data["valid_count"] / s_data["count"]) * 100.0, 1)
            else:
                s_data["pass_rate"] = None
            s_data["validCount"] = s_data["valid_count"]
            s_data["flaggedCount"] = s_data["flagged_count"]
            s_data["passRate"] = s_data["pass_rate"]

        metrics = {
            "total_records": total_records,
            "valid_records": valid_records,
            "flagged_records": flagged_records,
            "confirmed_failures": confirmed_failures,
            "unusual_values": unusual_values,
            "record_pass_rate": pass_rate,
            "data_quality_percentage": pass_rate,
            "validity_method": "PER_RECORD",
            "sector_breakdown": sector_counts,
        }

        return validated_records, findings, metrics
