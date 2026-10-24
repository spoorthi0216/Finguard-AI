"""
FinGuard AI — CSV Ingestion Service (Stage 3)
Safely reads CSV input, normalizes column headers using documented aliases,
preserves raw input strings, and validates structure without silently dropping rows.
"""

import io
import re
from typing import Dict, List, Tuple, Any, Union
import pandas as pd


# Documented column aliases mapping canonical names to recognized variations
COLUMN_ALIASES: Dict[str, List[str]] = {
    "company_id": ["company_id", "companyid", "cik", "lei", "entity_id", "company_identifier"],
    "ticker": ["ticker", "symbol", "stock_symbol", "ticker_symbol"],
    "company_name": ["company_name", "companyname", "name", "entity_name", "company"],
    "sector": ["sector", "industry", "sector_name"],
    "period": ["period", "fiscal_period", "reporting_period", "quarter", "fiscal_quarter"],
    "filing_date": ["filing_date", "filingdate", "date", "filed_at"],
    "currency": ["currency", "curr"],
    "revenue": ["revenue", "total_revenue", "sales", "rev", "gross_revenue"],
    "expenses": ["expenses", "operating_expenses", "opex", "total_expenses", "exp"],
    "reported_profit": ["reported_profit", "profit", "net_income", "ebit", "operating_profit", "reported_income"],
    "ebitda": ["ebitda"],
    "credit_rating": ["credit_rating", "rating", "rating_grade"],
    "row_number": ["row_number", "rownumber", "row", "line", "line_number"],
}

# Required structural columns that must be identifiable in the CSV header
MANDATORY_CANONICAL_COLUMNS: List[str] = ["company_id", "period"]


class CSVIngestionError(Exception):
    """Custom exception raised when CSV input cannot be safely ingested."""
    def __init__(self, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


def clean_header_string(header: str) -> str:
    """Normalizes an individual column header string."""
    cleaned = header.strip().lower()
    cleaned = re.sub(r"[^a-z0-9]+", "_", cleaned)
    return cleaned.strip("_")


def resolve_column_mapping(actual_headers: List[str]) -> Tuple[Dict[str, str], List[str]]:
    """
    Maps actual CSV header names to canonical schema names using COLUMN_ALIASES.
    Returns: (mapping: {actual_header: canonical_name}, missing_mandatory_columns: List[str])
    """
    mapping: Dict[str, str] = {}
    matched_canonical = set()

    normalized_actual = {h: clean_header_string(h) for h in actual_headers}

    for actual_raw, norm in normalized_actual.items():
        found = False
        for canonical, aliases in COLUMN_ALIASES.items():
            if norm == canonical or norm in aliases:
                mapping[actual_raw] = canonical
                matched_canonical.add(canonical)
                found = True
                break
        if not found:
            mapping[actual_raw] = norm  # Retain custom column name

    missing_mandatory = [col for col in MANDATORY_CANONICAL_COLUMNS if col not in matched_canonical]
    return mapping, missing_mandatory


def read_and_normalize_csv(
    source: Union[str, bytes, io.StringIO, io.BytesIO]
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Reads CSV input safely, normalizes headers, preserves raw strings,
    and returns a clean DataFrame with row numbers and ingestion metadata.
    
    Does NOT silently drop rows or prematurely cast invalid strings to NaN.
    """
    # 1. Handle input types & check for empty input
    if isinstance(source, bytes):
        if not source.strip():
            raise CSVIngestionError("EMPTY_FILE", "The uploaded CSV file is empty (0 bytes).")
        stream = io.BytesIO(source)
    elif isinstance(source, str):
        if not source.strip():
            raise CSVIngestionError("EMPTY_FILE", "The provided CSV text payload is empty.")
        stream = io.StringIO(source)
    else:
        stream = source

    # 2. Parse with Pandas using string types to prevent premature conversion
    try:
        df_raw = pd.read_csv(
            stream,
            dtype=str,
            keep_default_na=False,
            skipinitialspace=True,
            on_bad_lines="error",
        )
    except pd.errors.EmptyDataError:
        raise CSVIngestionError("EMPTY_FILE", "The CSV file contains no data rows or header.")
    except pd.errors.ParserError as pe:
        raise CSVIngestionError("MALFORMED_CSV", f"CSV parsing error: {str(pe)}")
    except Exception as exc:
        raise CSVIngestionError("CSV_READ_ERROR", f"Failed to read CSV input: {str(exc)}")

    if df_raw.empty and len(df_raw.columns) == 0:
        raise CSVIngestionError("EMPTY_FILE", "The CSV file contains no columns or data.")

    # 3. Resolve column mapping & check mandatory headers
    headers = list(df_raw.columns)
    mapping, missing_mandatory = resolve_column_mapping(headers)

    if missing_mandatory:
        raise CSVIngestionError(
            "MISSING_REQUIRED_COLUMNS",
            f"Missing required columns in CSV header: {', '.join(missing_mandatory)}. "
            f"Expected headers or recognized aliases for {MANDATORY_CANONICAL_COLUMNS}.",
            details={"missing_columns": missing_mandatory, "detected_headers": headers},
        )

    # 4. Rename DataFrame to canonical headers
    df = df_raw.rename(columns=mapping)

    # 5. Add or preserve 1-indexed row number
    if "row_number" in df.columns:
        df["row_number"] = pd.to_numeric(df["row_number"], errors="coerce").fillna(pd.Series(range(1, len(df) + 1), index=df.index)).astype(int)
    else:
        df["row_number"] = range(1, len(df) + 1)

    # 6. Ensure standard canonical columns exist with defaults if optional
    default_columns = {
        "ticker": None,
        "company_name": None,
        "sector": None,
        "filing_date": "2024-01-01",
        "currency": None,
        "revenue": "",
        "expenses": "",
        "reported_profit": "",
        "ebitda": "0",
        "credit_rating": "BBB",
    }
    for col, default_val in default_columns.items():
        if col not in df.columns:
            df[col] = default_val

    # 7. Preserve raw input values explicitly
    df["raw_revenue"] = df["revenue"].astype(str)
    df["raw_expenses"] = df["expenses"].astype(str)
    df["raw_reported_profit"] = df["reported_profit"].astype(str)

    metadata = {
        "total_rows": len(df),
        "detected_headers": headers,
        "resolved_mapping": mapping,
    }

    return df, metadata
