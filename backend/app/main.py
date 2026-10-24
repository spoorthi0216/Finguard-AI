"""
FinGuard AI — FastAPI Application Entry Point (Stage 4)
Authoritative Financial Data Quality & Lineage Service
Integrated with Deterministic Validation Engine & SQLite Ingestion
"""

import os
import sys
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure backend root directory is in sys.path regardless of launch cwd
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.database import init_db, check_db_health, get_db_path
from app.services.ingestion import CSVIngestionError
from app.services.pipeline import (
    execute_ingestion_pipeline,
    execute_validation_only,
    fetch_persisted_records,
    fetch_persisted_findings,
    fetch_persisted_audit_events,
    fetch_persisted_runs,
    fetch_persisted_metrics,
)

# Service Configuration (Default: Port 8001, avoiding conflict with 8000)
SERVICE_PORT = int(os.getenv("PYTHON_PORT", os.getenv("PORT", "8001")))
SERVICE_HOST = os.getenv("HOST", "0.0.0.0")

app = FastAPI(
    title="FinGuard AI — Financial Data Intelligence Service",
    description="Python FastAPI backend for financial statement ingestion, deterministic validation, and SQLite audit lineage.",
    version="1.3.0",
)

# Enable CORS for React frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    """
    Ensures SQLite tables exist on service startup without modifying existing data.
    """
    try:
        init_db()
    except Exception as exc:
        print(f"[FinGuard DB] Warning during database initialization on startup: {exc}")


# -----------------------------------------------------------------------------
# Schemas
# -----------------------------------------------------------------------------
class ValidationResponse(BaseModel):
    total_records: int
    valid_records: int
    flagged_records: int
    confirmed_failures: int
    unusual_values: int
    data_quality_percentage: float
    validation_findings: List[Dict[str, Any]]
    records: List[Dict[str, Any]]
    metadata: Dict[str, Any]


class IngestionResponse(ValidationResponse):
    run_id: str


class IngestionRunItemModel(BaseModel):
    runId: str
    filename: str
    startedAt: str
    completedAt: Optional[str] = None
    totalRows: int = 0
    acceptedRecords: int = 0
    rejectedRecords: int = 0
    findingsCount: int = 0
    status: str
    errorSummary: Optional[str] = None


class IngestionRunsResponse(BaseModel):
    runs: List[IngestionRunItemModel]


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@app.get("/")
def read_root():
    db_health = check_db_health()
    return {
        "service": "FinGuard AI Python Service",
        "version": "1.3.0",
        "docs_url": "/docs",
        "health_check": "/health",
        "status": "online",
        "database_status": db_health.get("status", "unknown"),
        "endpoints": ["/health", "/ingest", "/validate", "/records", "/findings", "/runs", "/audit", "/metrics"],
    }


@app.get("/health")
def read_health():
    """
    Service health check endpoint.
    Performs a real SQLite connection and query to verify health.
    """
    db_health = check_db_health()
    is_healthy = db_health.get("status") == "healthy"

    return {
        "service": "FinGuard AI Python Validation Service",
        "status": "online" if is_healthy else "degraded",
        "version": "1.3.0",
        "port": SERVICE_PORT,
        "database": db_health,
        "engine": {
            "name": "FastAPI + Pandas Validation Engine",
            "status": "initialized",
            "authoritative": True,
            "rules_count": 7,
        },
    }


@app.post("/ingest", response_model=IngestionResponse)
async def ingest_financial_csv(
    request: Request,
    file: Optional[UploadFile] = File(None),
    profit_tolerance: float = Form(5.0),
):
    """
    POST /ingest:
    Accepts CSV upload (multipart file or JSON with csv_text),
    runs deterministic validation, persists records and findings to SQLite,
    records the ingestion run in audit_events, and returns structured quality metrics.
    """
    csv_content: str = ""
    filename: str = "upload.csv"
    max_size_bytes = 10 * 1024 * 1024  # 10MB limit

    if file:
        filename = file.filename or "uploaded_file.csv"
        content_bytes = await file.read()
        if len(content_bytes) > max_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File size exceeds maximum permitted limit of 10MB.",
            )
        try:
            csv_content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is not a valid UTF-8 encoded CSV text file.",
            )
    else:
        try:
            body = await request.json()
            csv_content = body.get("csv_text", "")
            filename = body.get("filename", "payload.csv")
            profit_tolerance = float(body.get("profit_tolerance", profit_tolerance))
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide either a multipart file or a JSON payload containing 'csv_text'.",
            )

    try:
        result = execute_ingestion_pipeline(
            csv_source=csv_content,
            profit_tolerance=profit_tolerance,
            filename=filename,
        )
        return result
    except CSVIngestionError as cie:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": cie.code, "message": cie.message, "details": cie.details},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion pipeline failed: {str(exc)}",
        )


@app.post("/validate", response_model=ValidationResponse)
async def validate_financial_csv(
    request: Request,
    file: Optional[UploadFile] = File(None),
    profit_tolerance: float = Form(5.0),
):
    """
    POST /validate:
    Validates CSV financial filings using deterministic rules
    WITHOUT persisting records to SQLite.
    """
    csv_content: str = ""

    if file:
        content_bytes = await file.read()
        try:
            csv_content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is not a valid UTF-8 encoded CSV text file.",
            )
    else:
        try:
            body = await request.json()
            csv_content = body.get("csv_text", "")
            profit_tolerance = float(body.get("profit_tolerance", profit_tolerance))
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide either a multipart file or a JSON payload containing 'csv_text'.",
            )

    try:
        result = execute_validation_only(
            csv_source=csv_content,
            profit_tolerance=profit_tolerance,
        )
        return result
    except CSVIngestionError as cie:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": cie.code, "message": cie.message, "details": cie.details},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Validation failed: {str(exc)}",
        )


@app.get("/records")
def get_records():
    """Returns persisted financial records from SQLite."""
    try:
        return {"records": fetch_persisted_records()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/findings")
def get_findings():
    """Returns active validation findings from SQLite."""
    try:
        return {"findings": fetch_persisted_findings()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/audit")
@app.get("/audit/", include_in_schema=False)
def get_audit_trail():
    """Returns immutable audit events from SQLite."""
    try:
        return {"audit_events": fetch_persisted_audit_events()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/runs", response_model=IngestionRunsResponse)
@app.get("/runs/", response_model=IngestionRunsResponse, include_in_schema=False)
@app.get("/ingestion_runs", response_model=IngestionRunsResponse, include_in_schema=False)
@app.get("/ingestion-runs", response_model=IngestionRunsResponse, include_in_schema=False)
def get_ingestion_runs():
    """Returns tracked ingestion runs from SQLite."""
    try:
        return {"runs": fetch_persisted_runs()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/metrics")
def get_metrics():
    """Returns dataset-wide quality & financial metrics from SQLite."""
    try:
        return {"metrics": fetch_persisted_metrics()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
