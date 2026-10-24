"""
FinGuard AI — Database Ingestion & Pipeline Service (Stage 3 & 4)
Coordinates CSV ingestion, validation execution, and SQLite transactions.
Provides read/write functions for records, findings, metrics, and audit trail.
"""

import json
import uuid
import sqlite3
from typing import Dict, Any, List, Optional, Union
import pandas as pd

from app.database import get_db_connection, init_db
from app.services.ingestion import read_and_normalize_csv
from app.services.validator import FinancialValidationEngine


def execute_ingestion_pipeline(
    csv_source: Union[str, bytes],
    db_path: Optional[str] = None,
    profit_tolerance: float = 5.0,
    run_id: Optional[str] = None,
    filename: Optional[str] = "upload.csv",
) -> Dict[str, Any]:
    """
    Complete ingestion workflow:
    1. Records ingestion run attempt and audit event in SQLite.
    2. Parses & normalizes CSV input using Pandas.
    3. Runs deterministic validation engine.
    4. Persists companies, financial records, findings, and audit log atomically in SQLite.
    5. Rolls back on database exceptions without leaving orphaned data, recording failure in audit history.
    """
    active_run_id = run_id or f"RUN-{uuid.uuid4().hex[:10].upper()}"
    safe_filename = (filename or "upload.csv").replace("\\", "/").split("/")[-1]

    init_db(db_path)
    
    # Step 1: Record ingestion attempt start in audit log and runs table
    init_conn = get_db_connection(db_path)
    try:
        with init_conn:
            init_cursor = init_conn.cursor()
            init_cursor.execute("""
                INSERT OR REPLACE INTO ingestion_runs (
                    run_id, filename, started_at, status
                ) VALUES (?, ?, CURRENT_TIMESTAMP, 'IN_PROGRESS');
            """, (active_run_id, safe_filename))

            audit_start_id = f"audit-{uuid.uuid4().hex[:12]}"
            init_cursor.execute("""
                INSERT INTO audit_events (
                    id, run_id, record_id, action, field_name, before_value,
                    after_value, justification
                ) VALUES (?, ?, NULL, 'INGESTION_STARTED', 'filename', NULL, ?, ?);
            """, (
                audit_start_id,
                active_run_id,
                safe_filename,
                f"Ingestion attempt started for file '{safe_filename}'",
            ))
    finally:
        init_conn.close()

    # Step 2: Parse and validate CSV with failure tracking
    try:
        df, meta = read_and_normalize_csv(csv_source)
        validator = FinancialValidationEngine(profit_tolerance=profit_tolerance)
        records, findings, metrics = validator.validate_dataset(df)
    except Exception as exc:
        # Record failed ingestion attempt in persistent audit history
        fail_conn = get_db_connection(db_path)
        try:
            with fail_conn:
                f_cursor = fail_conn.cursor()
                f_cursor.execute("""
                    UPDATE ingestion_runs 
                    SET completed_at = CURRENT_TIMESTAMP, status = 'FAILED', error_summary = ?
                    WHERE run_id = ?;
                """, (str(exc), active_run_id))

                audit_fail_id = f"audit-{uuid.uuid4().hex[:12]}"
                f_cursor.execute("""
                    INSERT INTO audit_events (
                        id, run_id, record_id, action, field_name, before_value,
                        after_value, justification
                    ) VALUES (?, ?, NULL, 'INGESTION_FAILED', 'error', NULL, ?, ?);
                """, (
                    audit_fail_id,
                    active_run_id,
                    str(exc),
                    f"Ingestion failed during CSV parsing or schema validation: {str(exc)}",
                ))
        finally:
            fail_conn.close()
        raise

    # Step 3: Atomic database transaction for financial ledger and findings
    conn = get_db_connection(db_path)
    try:
        with conn:
            cursor = conn.cursor()

            # Step A: Resolve or insert companies using non-destructive UPSERT
            for rec in records:
                cid = rec.get("company_id")
                if cid and str(cid).strip():
                    cid_str = str(cid).strip()
                    t_val = rec.get("ticker")
                    t_str = str(t_val).strip() if (t_val is not None and str(t_val).strip() != "") else None
                    n_val = rec.get("company_name")
                    n_str = str(n_val).strip() if (n_val is not None and str(n_val).strip() != "" and str(n_val).strip().lower() not in ("nan", "none")) else None
                    s_val = rec.get("sector")
                    s_str = str(s_val).strip() if (s_val is not None and str(s_val).strip() != "" and str(s_val).strip().lower() not in ("nan", "none")) else None

                    cursor.execute("""
                        INSERT INTO companies (company_id, ticker, name, sector)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(company_id) DO UPDATE SET
                            ticker = CASE WHEN ? IS NOT NULL AND TRIM(?) != '' THEN ? ELSE companies.ticker END,
                            name = CASE WHEN ? IS NOT NULL AND TRIM(?) != '' THEN ? ELSE companies.name END,
                            sector = CASE WHEN ? IS NOT NULL AND TRIM(?) != '' THEN ? ELSE companies.sector END;
                    """, (
                        cid_str, t_str, n_str, s_str,
                        t_str, t_str, t_str,
                        n_str, n_str, n_str,
                        s_str, s_str, s_str,
                    ))

            # Step B: Insert or replace financial records
            for rec in records:
                cid = rec.get("company_id")
                cid_val = str(cid).strip() if (cid and str(cid).strip()) else None

                cursor.execute("""
                    INSERT OR REPLACE INTO financial_records (
                        id, company_id, period, revenue, expenses, reported_profit,
                        calculated_profit, profit_discrepancy, validation_status,
                        raw_payload, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
                """, (
                    rec["id"],
                    cid_val,
                    rec.get("period") or "",
                    rec["revenue"],
                    rec["expenses"],
                    rec["reported_profit"],
                    rec["calculated_profit"],
                    rec["profit_discrepancy"],
                    rec["validation_status"],
                    json.dumps(rec["raw_payload"]),
                ))

            # Step C: Insert validation findings with lineage to active_run_id
            for issue in findings:
                cursor.execute("""
                    INSERT OR REPLACE INTO validation_findings (
                        id, run_id, record_id, rule_id, rule_name, severity, issue_type,
                        column_name, affected_value, expected_value, message, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    issue["id"],
                    active_run_id,
                    issue["record_id"],
                    issue["rule_id"],
                    issue["rule_name"],
                    issue["severity"],
                    issue["issue_type"],
                    issue.get("column_name"),
                    str(issue["affected_value"]) if issue["affected_value"] is not None else None,
                    str(issue["expected_value"]) if issue["expected_value"] is not None else None,
                    issue.get("message") or issue.get("description") or issue["rule_name"],
                    issue.get("status", "OPEN"),
                ))

            # Determine run completion status
            if metrics["confirmed_failures"] > 0:
                final_status = "COMPLETED_WITH_ERRORS"
            elif metrics["unusual_values"] > 0:
                final_status = "SUCCESS_WITH_WARNINGS"
            else:
                final_status = "SUCCESS"

            # Step D: Update ingestion_runs table
            cursor.execute("""
                UPDATE ingestion_runs
                SET completed_at = CURRENT_TIMESTAMP,
                    total_rows = ?,
                    accepted_records = ?,
                    rejected_records = 0,
                    findings_count = ?,
                    status = ?,
                    error_summary = NULL
                WHERE run_id = ?;
            """, (
                metrics["total_records"],
                metrics["total_records"],
                len(findings),
                final_status,
                active_run_id,
            ))

            # Step E: Record persistence outcome in audit_events
            persist_audit_id = f"audit-{uuid.uuid4().hex[:12]}"
            cursor.execute("""
                INSERT INTO audit_events (
                    id, run_id, record_id, action, field_name, before_value,
                    after_value, justification
                ) VALUES (?, ?, NULL, 'DATABASE_PERSISTENCE', 'financial_records', NULL, ?, ?);
            """, (
                persist_audit_id,
                active_run_id,
                f"{metrics['total_records']} Records",
                f"Successfully committed {metrics['total_records']} financial records into SQLite ledger.",
            ))

            # Step F: Record completion event in audit_events
            audit_id = f"audit-{uuid.uuid4().hex[:12]}"
            justification = (
                f"Batch ingestion finished for {metrics['total_records']} records. "
                f"Valid: {metrics['valid_records']}, Flagged: {metrics['flagged_records']}, "
                f"Findings: {len(findings)}, Pass Rate: {metrics['record_pass_rate']}%."
            )
            cursor.execute("""
                INSERT INTO audit_events (
                    id, run_id, record_id, action, field_name, before_value,
                    after_value, justification
                ) VALUES (?, ?, NULL, 'BATCH_INGESTION', 'batch_filings', NULL, ?, ?);
            """, (
                audit_id,
                active_run_id,
                f"{metrics['total_records']} Filings Ingested",
                justification,
            ))

    except Exception as db_exc:
        # If persistence fails, transaction rolled back automatically; record failure in separate connection
        rollback_conn = get_db_connection(db_path)
        try:
            with rollback_conn:
                rb_cursor = rollback_conn.cursor()
                rb_cursor.execute("""
                    UPDATE ingestion_runs 
                    SET completed_at = CURRENT_TIMESTAMP, status = 'FAILED', error_summary = ?
                    WHERE run_id = ?;
                """, (f"Database transaction failure: {str(db_exc)}", active_run_id))

                audit_rb_id = f"audit-{uuid.uuid4().hex[:12]}"
                rb_cursor.execute("""
                    INSERT INTO audit_events (
                        id, run_id, record_id, action, field_name, before_value,
                        after_value, justification
                    ) VALUES (?, ?, NULL, 'PERSISTENCE_FAILED', 'database_transaction', NULL, 'ROLLED_BACK', ?);
                """, (
                    audit_rb_id,
                    active_run_id,
                    f"Transaction rolled back due to error: {str(db_exc)}",
                ))
        finally:
            rollback_conn.close()
        raise
    finally:
        conn.close()

    return {
        "run_id": active_run_id,
        "total_records": metrics["total_records"],
        "valid_records": metrics["valid_records"],
        "flagged_records": metrics["flagged_records"],
        "confirmed_failures": metrics["confirmed_failures"],
        "unusual_values": metrics["unusual_values"],
        "data_quality_percentage": metrics["data_quality_percentage"],
        "record_pass_rate": metrics["record_pass_rate"],
        "validation_findings": findings,
        "records": records,
        "metadata": meta,
    }


def execute_validation_only(
    csv_source: Union[str, bytes],
    profit_tolerance: float = 5.0,
) -> Dict[str, Any]:
    """
    Validates CSV input using deterministic rules WITHOUT writing to SQLite.
    """
    df, meta = read_and_normalize_csv(csv_source)
    validator = FinancialValidationEngine(profit_tolerance=profit_tolerance)
    records, findings, metrics = validator.validate_dataset(df)

    return {
        "total_records": metrics["total_records"],
        "valid_records": metrics["valid_records"],
        "flagged_records": metrics["flagged_records"],
        "confirmed_failures": metrics["confirmed_failures"],
        "unusual_values": metrics["unusual_values"],
        "data_quality_percentage": metrics["data_quality_percentage"],
        "validation_findings": findings,
        "records": records,
        "metadata": meta,
    }


def fetch_persisted_records(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieves all financial records from SQLite joined with company metadata."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                r.id, r.company_id, r.period, r.revenue, r.expenses,
                r.reported_profit, r.calculated_profit, r.profit_discrepancy,
                r.validation_status, r.raw_payload,
                c.ticker, c.name AS company_name, c.sector,
                DATE(r.created_at) AS filing_date
            FROM financial_records r
            LEFT JOIN companies c ON r.company_id = c.company_id
            ORDER BY r.rowid ASC;
        """)
        rows = cursor.fetchall()
        
        # Also fetch findings map
        cursor.execute("SELECT * FROM validation_findings WHERE status = 'OPEN';")
        findings_rows = cursor.fetchall()
        findings_by_record: Dict[str, List[Dict[str, Any]]] = {}
        for f in findings_rows:
            rid = f["record_id"]
            if rid not in findings_by_record:
                findings_by_record[rid] = []
            findings_by_record[rid].append(dict(f))

        results = []
        for idx, row in enumerate(rows):
            r_dict = dict(row)
            try:
                raw_payload = json.loads(r_dict.get("raw_payload") or "{}")
            except Exception:
                raw_payload = {}

            # Compute operating margin
            rev = r_dict.get("revenue")
            prof = r_dict.get("reported_profit")
            margin = round((prof / rev) * 100, 1) if (rev and prof and rev > 0) else None

            results.append({
                "id": r_dict["id"],
                "rawLineNumber": raw_payload.get("row_number", idx + 1),
                "companyId": r_dict["company_id"],
                "ticker": r_dict.get("ticker"),
                "companyName": r_dict.get("company_name"),
                "sector": r_dict.get("sector") or raw_payload.get("sector") or None,
                "period": r_dict["period"],
                "filingDate": str(r_dict.get("filing_date") or "2024-01-01"),
                "currency": raw_payload.get("currency") or None,
                "revenue": r_dict.get("revenue"),
                "expenses": r_dict.get("expenses"),
                "reportedProfit": r_dict.get("reported_profit"),
                "calculatedProfit": r_dict.get("calculated_profit"),
                "profitDiscrepancy": r_dict.get("profit_discrepancy"),
                "operatingMargin": margin,
                "ebitda": 0.0,
                "creditRating": "BBB",
                "validationStatus": r_dict["validation_status"],
                "issues": findings_by_record.get(r_dict["id"], []),
                "isModified": bool(r_dict.get("is_modified")),
                "rawRevenue": raw_payload.get("raw_revenue", ""),
                "rawExpenses": raw_payload.get("raw_expenses", ""),
                "rawReportedProfit": raw_payload.get("raw_reported_profit", ""),
            })
        return results
    finally:
        conn.close()


def fetch_persisted_runs(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieves all tracked ingestion runs from SQLite."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                run_id, filename, started_at, completed_at,
                total_rows, accepted_records, rejected_records,
                findings_count, status, error_summary
            FROM ingestion_runs
            ORDER BY rowid DESC;
        """)
        results = []
        for r in cursor.fetchall():
            d = dict(r)
            results.append({
                "runId": d["run_id"],
                "filename": d["filename"],
                "startedAt": d["started_at"],
                "completedAt": d["completed_at"],
                "totalRows": d["total_rows"] or 0,
                "acceptedRecords": d["accepted_records"] or 0,
                "rejectedRecords": d["rejected_records"] or 0,
                "findingsCount": d["findings_count"] or 0,
                "status": d["status"],
                "errorSummary": d["error_summary"],
            })
        return results
    finally:
        conn.close()


def fetch_persisted_findings(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieves all active validation findings from SQLite joined with entity metadata."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                f.id, f.run_id, f.record_id, f.rule_id, f.rule_name, f.severity,
                f.issue_type, f.column_name, f.affected_value, f.expected_value, f.message, f.status,
                f.created_at,
                r.company_id, r.period, c.ticker, c.name AS company_name
            FROM validation_findings f
            JOIN financial_records r ON f.record_id = r.id
            LEFT JOIN companies c ON r.company_id = c.company_id
            WHERE f.status = 'OPEN'
            ORDER BY 
                CASE f.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
                f.rowid ASC;
        """)
        results = []
        for r in cursor.fetchall():
            d = dict(r)
            results.append({
                "id": d["id"],
                "run_id": d.get("run_id") or "LEGACY",
                "runId": d.get("run_id") or "LEGACY",
                "record_id": d["record_id"],
                "recordId": d["record_id"],
                "rule_id": d["rule_id"],
                "ruleId": d["rule_id"],
                "rule_name": d["rule_name"],
                "ruleName": d["rule_name"],
                "severity": d["severity"],
                "issue_type": d["issue_type"],
                "issueType": d["issue_type"],
                "column_name": d.get("column_name") or "",
                "columnName": d.get("column_name") or "",
                "affected_value": d["affected_value"],
                "affectedValue": d["affected_value"],
                "expected_value": d["expected_value"],
                "expectedValue": d["expected_value"],
                "message": d.get("message") or d["rule_name"],
                "status": d["status"],
                "company_id": d.get("company_id"),
                "companyId": d.get("company_id"),
                "company_name": d.get("company_name"),
                "companyName": d.get("company_name"),
                "ticker": d.get("ticker"),
                "period": d.get("period"),
                "created_at": d.get("created_at"),
                "createdAt": d.get("created_at"),
            })
        return results
    finally:
        conn.close()


def fetch_persisted_audit_events(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieves immutable audit trail history from SQLite."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                a.id, a.run_id, a.record_id, a.action, a.field_name,
                a.before_value, a.after_value, a.justification, a.timestamp,
                r.company_id, c.ticker
            FROM audit_events a
            LEFT JOIN financial_records r ON a.record_id = r.id
            LEFT JOIN companies c ON r.company_id = c.company_id
            ORDER BY a.rowid DESC;
        """)
        results = []
        for r in cursor.fetchall():
            d = dict(r)
            results.append({
                "id": d["id"],
                "runId": d["run_id"],
                "recordId": d["record_id"] or "BATCH",
                "action": d["action"],
                "field": d["field_name"],
                "beforeValue": d["before_value"],
                "afterValue": d["after_value"],
                "justification": d["justification"],
                "timestamp": d["timestamp"],
                "user": "python_fastapi_engine",
                "remediationTicket": f"DQ-{d['id'][-4:].upper()}",
                "companyId": d.get("company_id") or "SYSTEM",
                "ticker": d.get("ticker") or "SYSTEM",
            })
        return results
    finally:
        conn.close()


def fetch_persisted_metrics(db_path: Optional[str] = None) -> Dict[str, Any]:
    """Computes aggregated financial and quality metrics directly from SQLite tables."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                COUNT(*) AS total_records,
                SUM(CASE WHEN validation_status = 'VALID' THEN 1 ELSE 0 END) AS valid_records,
                SUM(CASE WHEN validation_status = 'CRITICAL_FAILURE' THEN 1 ELSE 0 END) AS confirmed_failures,
                SUM(CASE WHEN validation_status = 'ANOMALY_INVESTIGATION' THEN 1 ELSE 0 END) AS unusual_values,
                COALESCE(SUM(revenue), 0) AS total_revenue,
                COALESCE(SUM(reported_profit), 0) AS total_reported_profit,
                COALESCE(SUM(calculated_profit), 0) AS total_calculated_profit,
                COALESCE(SUM(profit_discrepancy), 0) AS total_discrepancy
            FROM financial_records;
        """)
        row = dict(cursor.fetchone())
        total = row["total_records"] or 0
        valid = row["valid_records"] or 0
        flagged = total - valid
        dq_pct = round((valid / total) * 100.0, 1) if total > 0 else None

        # Sector breakdown from persisted records and company metadata
        predefined_sectors = ["Technology", "Financials", "Healthcare", "Energy", "Consumer", "Industrials"]
        sector_breakdown: Dict[str, Dict[str, Any]] = {
            s: {
                "count": 0,
                "validCount": 0,
                "flaggedCount": 0,
                "passRate": None,
                "revenue": 0.0,
                "valid_count": 0,
                "flagged_count": 0,
                "pass_rate": None,
            }
            for s in predefined_sectors
        }

        cursor.execute("""
            SELECT 
                COALESCE(NULLIF(TRIM(c.sector), ''), NULLIF(TRIM(json_extract(r.raw_payload, '$.sector')), ''), 'Unassigned') AS sector_name,
                COUNT(DISTINCT r.id) AS total_count,
                SUM(CASE WHEN r.validation_status = 'VALID' THEN 1 ELSE 0 END) AS valid_count,
                SUM(CASE WHEN r.validation_status != 'VALID' THEN 1 ELSE 0 END) AS flagged_count,
                COALESCE(SUM(r.revenue), 0.0) AS total_revenue
            FROM financial_records r
            LEFT JOIN companies c ON r.company_id = c.company_id
            GROUP BY sector_name;
        """)
        for s_row in cursor.fetchall():
            s_dict = dict(s_row)
            sec_name = s_dict["sector_name"]
            cnt = s_dict["total_count"] or 0
            v_cnt = s_dict["valid_count"] or 0
            f_cnt = s_dict["flagged_count"] or 0
            rev = round(s_dict["total_revenue"] or 0.0, 2)
            p_rate = round((v_cnt / cnt) * 100.0, 1) if cnt > 0 else None

            sector_breakdown[sec_name] = {
                "count": cnt,
                "validCount": v_cnt,
                "flaggedCount": f_cnt,
                "passRate": p_rate,
                "revenue": rev,
                "valid_count": v_cnt,
                "flagged_count": f_cnt,
                "pass_rate": p_rate,
            }

        # Currency breakdown to prevent silent currency mixing
        cursor.execute("""
            SELECT 
                COALESCE(NULLIF(TRIM(json_extract(raw_payload, '$.currency')), ''), 'Unknown') AS curr_code,
                COUNT(*) AS curr_count,
                COALESCE(SUM(revenue), 0.0) AS curr_revenue,
                COALESCE(SUM(reported_profit), 0.0) AS curr_reported_profit
            FROM financial_records
            GROUP BY curr_code;
        """)
        currency_breakdown: Dict[str, Dict[str, Any]] = {}
        for c_row in cursor.fetchall():
            c_dict = dict(c_row)
            curr_code = c_dict["curr_code"]
            currency_breakdown[curr_code] = {
                "count": c_dict["curr_count"] or 0,
                "revenue": round(c_dict["curr_revenue"] or 0.0, 2),
                "reportedProfit": round(c_dict["curr_reported_profit"] or 0.0, 2),
            }

        return {
            "totalRecords": total,
            "validRecords": valid,
            "flaggedRecords": flagged,
            "confirmedFailures": row["confirmed_failures"] or 0,
            "unusualValues": row["unusual_values"] or 0,
            "dataQualityScore": dq_pct,
            "dataQualityPercentage": dq_pct,
            "recordPassRate": dq_pct,
            "validityMethod": "PER_RECORD",
            "totalRevenue": round(row["total_revenue"], 2),
            "totalReportedProfit": round(row["total_reported_profit"], 2),
            "totalCalculatedProfit": round(row["total_calculated_profit"], 2),
            "totalDiscrepancy": round(row["total_discrepancy"], 2),
            "sectorBreakdown": sector_breakdown,
            "sector_breakdown": sector_breakdown,
            "currencyBreakdown": currency_breakdown,
            "currency_breakdown": currency_breakdown,
        }
    finally:
        conn.close()
