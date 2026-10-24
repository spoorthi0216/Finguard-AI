# FinGuard AI — Financial Data Quality & Lineage Platform

> **A production-ready, deterministic data quality and validation platform built with Python, FastAPI, Pandas, SQLite, React, and TypeScript.**  
> *Designed for demonstrating real data engineering, financial statement reconciliation, and persistent audit traceability.*

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Technologies and Their Purposes](#2-technologies-and-their-purposes)
3. [System Architecture Diagram & Data Flow](#3-system-architecture-diagram--data-flow)
4. [Prerequisites](#4-prerequisites)
5. [Windows Step-by-Step Installation](#5-windows-step-by-step-installation)
6. [Python Virtual Environment Setup](#6-python-virtual-environment-setup)
7. [Backend Dependency Installation](#7-backend-dependency-installation)
8. [Frontend Dependency Installation](#8-frontend-dependency-installation)
9. [Exact Backend Startup Command](#9-exact-backend-startup-command)
10. [Exact Frontend Startup Command](#10-exact-frontend-startup-command)
11. [Local Application and API URLs](#11-local-application-and-api-urls)
12. [CSV Ingestion & Canonical Schema](#12-csv-ingestion--canonical-schema)
13. [Deterministic Validation Rules & Accounting Reconciliation](#13-deterministic-validation-rules--accounting-reconciliation)
14. [SQLite Database Schema & Persistence](#14-sqlite-database-schema--persistence)
15. [Automated Testing Guide & Verification Report](#15-automated-testing-guide--verification-report)
16. [Common Startup & Dependency Troubleshooting](#16-common-startup--dependency-troubleshooting)
17. [Port Conflict Resolution (Ports 3000 & 8001)](#17-port-conflict-resolution-ports-3000--8001)
18. [GitHub Repository Preparation](#18-github-repository-preparation)
19. [Final Git Push Commands](#19-final-git-push-commands)
20. [Technical Interview Preparation Guide](#20-technical-interview-preparation-guide)
21. [Honest Project Limitations](#21-honest-project-limitations)
22. [License](#22-license)

---

## 1. Project Overview

In quantitative finance, credit analysis, and risk management, algorithms and credit rating scorecards rely on the accuracy of incoming financial filings (such as quarterly financial statements). If an ingested file contains a missing company identifier, an inverted expense sign, an arithmetic contradiction (`Reported Profit != Revenue - Expenses`), or mixed currency figures, downstream credit scorecards and leverage metrics become corrupted.

**FinGuard AI** solves this problem by providing an authoritative, deterministic data-quality gate:
1. **Real CSV Financial Data Ingestion:** Reads and normalizes financial filings using Python and Pandas.
2. **SQL-Based Validation & Reconciliation:** Executes deterministic rules including mathematical profit reconciliation, duplicate tuple detection, and numeric syntax validation.
3. **Accurate Data Quality Dashboard:** Visualizes verified pass rates, sector quality metrics, and currency-isolated totals without synthetic fallbacks.
4. **Persistent Audit History:** Records every ingestion attempt in `ingestion_runs` and every lifecycle step in an immutable `audit_events` ledger backed by SQLite.

---

## 2. Technologies and Their Purposes

| Technology | Purpose |
| :--- | :--- |
| **Python 3.10+** | Backend language powering high-performance tabular manipulation, validation routines, and data transformations. |
| **FastAPI** | Modern, asynchronous Python REST API providing automatic JSON schema validation, typed models, and interactive OpenAPI documentation. |
| **Pandas** | Tabular parsing, whitespace stripping, canonical column aliasing, and raw numeric representation preservation. |
| **SQLite (sqlite3)** | Embedded, serverless relational database providing ACID transactions, foreign-key enforcement, and persistent disk storage. |
| **SQL** | Declarative query language for schema DDL, indexed queries, UPSERT logic, and set-based quality aggregations. |
| **React 19 & TypeScript** | Component-driven user interface with static type checking, modular architecture, and real-time backend synchronization. |
| **Vite** | Fast frontend development server, bundling engine, and production compiler. |
| **Tailwind CSS** | Utility-first styling framework providing clean financial dashboard aesthetics with zero external UI bloat. |
| **pytest & unittest** | Testing frameworks validating all 27 mandatory financial data-quality, integrity, and persistence requirements. |

---

## 3. System Architecture Diagram & Data Flow

FinGuard AI maintains a strict separation of concerns: **Python FastAPI + SQLite** is the single authoritative source of truth for all calculations, validations, and storage, while **React + TypeScript** serves as the user presentation layer.

```
                    ┌───────────────────────────────────┐
                    │       User / Data Analyst         │
                    └─────────────────┬─────────────────┘
                                      │ Uploads CSV
                                      ▼
                    ┌───────────────────────────────────┐
                    │    React + Vite Frontend (UI)     │
                    │   (Port 3000 via Express Proxy)   │
                    └─────────────────┬─────────────────┘
                                      │ Reverse Proxy: /api/py/*
                                      ▼
                    ┌───────────────────────────────────┐
                    │   Python FastAPI Validation API   │
                    │      (Port 8001 / Uvicorn)        │
                    └─────────────────┬─────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            ▼                                                   ▼
┌───────────────────────────┐                       ┌───────────────────────────┐
│       Pandas Engine       │                       │  SQLite Relational Store  │
│  - CSV parsing & trim     │                       │  (backend/data/finguard.db│
│  - Header normalization   │  Atomic Transactions  │  - companies              │
│  - Raw string preservation│ ────────────────────> │  - financial_records      │
│  - Mathematical check     │                       │  - validation_findings    │
│  - Tolerance calculation  │                       │  - ingestion_runs         │
└───────────────────────────┘                       │  - audit_events           │
                                                    └───────────────────────────┘
```

### Complete End-to-End Execution Flow
1. **CSV Ingestion:** User selects or drops a `.csv` file in the UI Upload screen.
2. **Reverse Proxy Transmission:** Express forwards the file to FastAPI (`POST /ingest`).
3. **Pandas Normalization:** Ingestion service trims whitespace, normalizes aliases to canonical schema, and preserves raw unparsed strings for error attribution.
4. **Deterministic Validation:** Validation engine executes composite key collision checks, numeric syntax validation, and profit equation arithmetic with configurable tolerance.
5. **Atomic Persistence:** In an explicit SQLite transaction (`with conn:`), the engine upserts company master data, inserts financial records, attaches finding lineage with `run_id`, updates `ingestion_runs`, and logs audit trail events. If an error occurs, the transaction rolls back cleanly with zero partial writes.
6. **Dashboard Visualization:** React fetches authoritative metrics (`GET /metrics`), records (`GET /records`), findings (`GET /findings`), and audit runs (`GET /runs`), rendering verified pass rates and multi-currency breakdowns.

---

## 4. Prerequisites

Before installing FinGuard AI on your Windows laptop, ensure the following are installed:
1. **Windows 10 or 11** (64-bit).
2. **Python 3.10, 3.11, or 3.12:** Download from [python.org](https://www.python.org/downloads/).
   * *Critical:* Check the box **"Add Python to PATH"** during installation.
3. **Node.js (v18, v20, or v22 LTS):** Download from [nodejs.org](https://nodejs.org/).
4. **Git for Windows:** Download from [git-scm.com](https://git-scm.com/).
5. **Windows PowerShell** or Windows Terminal.

---

## 5. Windows Step-by-Step Installation

Extract the project ZIP file (or clone the repository) into a folder on your laptop (for example, `C:\Projects\finguard-ai`).

Open **PowerShell** and navigate to your project directory:
```powershell
cd C:\Projects\finguard-ai
```

---

## 6. Python Virtual Environment Setup

Create an isolated Python virtual environment inside the project directory:
```powershell
python -m venv venv
```

Activate the virtual environment:
```powershell
.\venv\Scripts\Activate.ps1
```
*(If PowerShell displays an execution policy error, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` and then run `.\venv\Scripts\Activate.ps1` again).*

You will see `(venv)` prepended to your PowerShell prompt, indicating the environment is active.

---

## 7. Backend Dependency Installation

With your virtual environment activated, install all backend requirements:
```powershell
pip install --upgrade pip
pip install -r backend/requirements.txt
```

This installs:
* `fastapi` (REST API framework)
* `uvicorn[standard]` (ASGI web server)
* `pydantic` (Data parsing and validation)
* `pandas` (CSV normalization and data wrangling)
* `python-multipart` (Multipart form-data uploads)
* `httpx` (HTTP client for FastAPI test suite)
* `pytest` (Automated testing runner)

---

## 8. Frontend Dependency Installation

In the same project root directory, install all Node.js dependencies:
```powershell
npm install
```

---

## 9. Exact Backend Startup Command

You have two convenient ways to start the backend:

### Option A: Standalone Uvicorn Process (Dedicated Terminal)
```powershell
# From the project root, activate your virtual environment:
.\venv\Scripts\Activate.ps1

# Launch the standalone runner:
python backend/run.py
```
Or directly via Uvicorn:
```powershell
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```
The FastAPI backend will start on **`http://localhost:8001`**.

---

## 10. Exact Frontend Startup Command

### Option B: Unified Full-Stack Runner (Recommended)
FinGuard AI includes an automated runner in `server.ts` that spawns the Python backend in the background and launches the Vite dev server with reverse proxy:
```powershell
# From the project root:
npm run dev
```

If you prefer running the frontend separately while Option A is running in another terminal:
```powershell
# In a second PowerShell terminal:
npm run dev
```

---

## 11. Local Application and API URLs

Once running, access the services in your web browser:

| Service / Interface | URL | Description |
| :--- | :--- | :--- |
| **FinGuard AI Web App** | `http://localhost:3000` | Full-stack financial data quality interface. |
| **FastAPI Swagger UI** | `http://localhost:8001/docs` | Interactive API documentation (tests all endpoints). |
| **FastAPI ReDoc** | `http://localhost:8001/redoc` | Alternative API reference documentation. |
| **API Health Check** | `http://localhost:8001/health` | Real-time SQLite connectivity check. |
| **Ingestion Runs API** | `http://localhost:8001/runs` | Tracked ingestion runs JSON response. |

---

## 12. CSV Ingestion & Canonical Schema

The application ingests financial filings formatted in the canonical schema below. A realistic synthetic test file is included at [`sample_financial_data.csv`](./sample_financial_data.csv).

| Column Name | Data Type | Requirement | Supported Aliases | Description |
| :--- | :--- | :--- | :--- | :--- |
| `company_id` | String | **Mandatory** | `companyid`, `cik`, `lei`, `entity_id` | Unique company identifier (e.g. `COMP-101`, `CIK-0000320193`). |
| `company_name` | String | **Mandatory** | `companyname`, `entity_name`, `company` | Official legal filing entity name (e.g. `Apex Dynamics Corp`). |
| `period` | String | **Mandatory** | `fiscal_period`, `reporting_period`, `quarter` | Documented format: `YYYY-Q[1-4]`, `YYYY-MM`, or `YYYY-FY` (e.g. `2025-Q1`). |
| `revenue` | Numeric Float | **Mandatory** | `total_revenue`, `sales`, `rev` | Gross revenue in native filing units. Must be numeric $\ge 0$. |
| `expenses` | Numeric Float | **Mandatory** | `operating_expenses`, `opex`, `total_expenses` | Operating expenses in native filing units. Must be numeric $\ge 0$. |
| `reported_profit` | Numeric Float | **Mandatory** | `profit`, `net_income`, `operating_profit` | Net income or operating profit as reported by filing entity. |
| `currency` | String | **Mandatory** | `curr` | 3-letter ISO code (`USD`, `EUR`, `GBP`, `INR`). Preserved without mixed aggregation. |
| `sector` | String | *Optional* | `industry`, `sector_name` | Industry classification (`Technology`, `Financials`, `Healthcare`, etc.). |

---

## 13. Deterministic Validation Rules & Accounting Reconciliation

All validation occurs deterministically in the Python backend. Findings are classified into two strict severity tiers:
* **CRITICAL (Confirmed Failures):** Violate mandatory schema constraints or mathematical rules. Blocks record acceptance.
* **WARNING (Unusual Values):** Syntax-compliant records that deviate from statistical peer baselines. Stored for review.

### Implemented Rules

1. **Mandatory Schema & Identifiers (`RULE_MISSING_VALUE` — CRITICAL)**
   * Every record must contain valid `company_id`, `company_name`, `period`, `revenue`, `expenses`, `reported_profit`, and `currency`.
   * Empty strings, `null`, `NaN`, and unresolvable blanks are flagged as Critical Failures.

2. **Composite Tuple Uniqueness (`RULE_DUPLICATE_KEY` — CRITICAL)**
   * A financial filing is uniquely identified by the composite key `(company_id, period)`.
   * Ingesting multiple rows for the same company and reporting period within a single batch is flagged as a Critical Failure.

3. **Numeric Syntax & Footnote Detection (`RULE_INVALID_NUMERIC` — CRITICAL)**
   * Financial values must be valid floating-point numbers.
   * Strings containing OCR artifacts, text comments, or footnote asterisks (e.g., `12450.00*`, `N/A`) are flagged. Raw unparsed strings are preserved.

4. **Accounting Arithmetic Reconciliation (`RULE_MATH_PROFIT_MISMATCH` — CRITICAL)**
   * Validates the core income statement equation:
     $$\text{Calculated Profit} = \text{Revenue} - \text{Expenses}$$
     $$\text{Profit Discrepancy} = \text{Reported Profit} - \text{Calculated Profit}$$
   * If $|\text{Profit Discrepancy}| > \text{Tolerance}$ (default: $5.00$ units), the record is flagged with a Critical Failure.

5. **Non-Negative Value Constraints (`RULE_NEGATIVE_EXPENSE`, `RULE_NEGATIVE_REVENUE` — CRITICAL)**
   * Gross revenue and operating expenses cannot be negative numbers under standard accounting principles. Negative values are flagged as Critical Failures.
   * *Note on Reported Profit:* Reported profit **can be negative** to represent legitimate net operating losses.

6. **Statistical Distribution Anomalies (`RULE_STATISTICAL_OUTLIER`, `RULE_MARGIN_ANOMALY` — WARNING)**
   * Operating margin is calculated as $\left(\frac{\text{Reported Profit}}{\text{Revenue}}\right) \times 100$.
   * Operating margins greater than $100\%$ or less than $-100\%$, or revenue figures exceeding 3 standard deviations from sector averages, are flagged as Warnings for analyst review without being rejected as errors.

---

## 14. SQLite Database Schema & Persistence

The database file is located at `backend/data/finguard.db`. Foreign key constraints are enforced on every connection (`PRAGMA foreign_keys = ON;`).

```sql
-- 1. Master Companies Table
CREATE TABLE IF NOT EXISTS companies (
    company_id TEXT PRIMARY KEY,
    ticker TEXT,
    name TEXT,
    sector TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Financial Records Ledger
CREATE TABLE IF NOT EXISTS financial_records (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    period TEXT NOT NULL,
    revenue REAL,
    expenses REAL,
    reported_profit REAL,
    calculated_profit REAL,
    profit_discrepancy REAL,
    validation_status TEXT NOT NULL,
    raw_payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (company_id) ON DELETE CASCADE
);

-- 3. Validation Findings Table
CREATE TABLE IF NOT EXISTS validation_findings (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    record_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    severity TEXT NOT NULL,
    issue_type TEXT NOT NULL,
    column_name TEXT,
    affected_value TEXT,
    expected_value TEXT,
    message TEXT,
    status TEXT DEFAULT 'OPEN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (record_id) REFERENCES financial_records (id) ON DELETE CASCADE
);

-- 4. Ingestion Runs Table
CREATE TABLE IF NOT EXISTS ingestion_runs (
    run_id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    total_rows INTEGER DEFAULT 0,
    accepted_records INTEGER DEFAULT 0,
    rejected_records INTEGER DEFAULT 0,
    findings_count INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    error_summary TEXT
);

-- 5. Audit Events Table
CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    record_id TEXT,
    action TEXT NOT NULL,
    field_name TEXT NOT NULL,
    before_value TEXT,
    after_value TEXT,
    justification TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (record_id) REFERENCES financial_records (id) ON DELETE SET NULL
);
```

---

## 15. Automated Testing Guide & Verification Report

### Running the Test Suite
With your virtual environment activated:
```powershell
# Run the complete test suite with pytest:
pytest backend/tests -v

# Or run with Python's built-in unittest runner:
python -m unittest discover -s backend/tests -t backend

# Run the frontend TypeScript type-checker:
npm run lint

# Run the production bundle compilation:
npm run build
```

### Verified Test Results Summary
All **94 automated backend tests** pass with 100% success:
* **`backend/tests/test_fastapi_endpoints.py` (6 / 6 Passed):** Verifies OpenAPI schema includes `GET /runs`, `GET /health` connectivity, empty database states, successful CSV upload with run lineage, failed upload handling with run logging, and route aliases (`/runs/`, `/ingestion_runs`, `/audit/`).
* **`backend/tests/test_mandatory_27_requirements.py` (27 / 27 Passed):** Directly verifies all 27 critical requirements from Section 13 (clean DDL, empty files, missing columns, duplicate keys, tolerance check, negative values, multi-currency isolation, zero-record pass rate, database persistence, transaction rollback, and restart integrity).
* **`backend/tests/test_stage4_1_regression.py` (9 / 9 Passed):** Verifies sector metrics, single-record evaluation semantics, precision preservation, and evidence-based finding lineage.
* **`backend/tests/test_validation_engine.py` (12 / 12 Passed):** Verifies deterministic rule evaluation logic and Pandas normalization.
* **`backend/tests/test_database.py` (6 / 6 Passed):** Verifies SQLite schema creation, foreign keys, and health checks.
* **`backend/tests/test_company_identity.py` (5 / 5 Passed):** Verifies non-destructive company UPSERT logic.
* **Legacy Root Test Runners (`backend/*.py`):** 29 additional integration checks passed.
* **Frontend TypeScript Checking:** `tsc --noEmit` passed with 0 errors.
* **Production Build:** `npm run build` compiled cleanly into `/dist` in 795ms.

---

## 16. Common Startup & Dependency Troubleshooting

### Issue 1: PowerShell Script Execution Error
* **Error:** `File ... Activate.ps1 cannot be loaded because running scripts is disabled on this system.`
* **Solution:** Run this command in PowerShell to allow script execution for the current session:
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```
  Then re-run `.\venv\Scripts\Activate.ps1`.

### Issue 2: Python Command Not Found
* **Error:** `'python' is not recognized as an internal or external command.`
* **Solution:** Rerun the Python installer, choose "Modify", and make sure the box **"Add Python to PATH"** is checked. Alternatively, invoke using `py -m venv venv`.

### Issue 3: Ingestion Runs Tab Empty
* **Solution:** Verify that the FastAPI backend is running on port 8001 (`http://127.0.0.1:8001/health`). If started independently, ensure Uvicorn was launched from the `backend/` directory or with `backend` on `PYTHONPATH` using `python backend/run.py`.

---

## 17. Port Conflict Resolution (Ports 3000 & 8001)

If port `3000` (Node/Express) or `8001` (FastAPI) is occupied:

1. Identify the process ID occupying the port:
   ```powershell
   Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess
   Get-Process -Id (Get-NetTCPConnection -LocalPort 8001).OwningProcess
   ```
2. Terminate the conflicting process:
   ```powershell
   Stop-Process -Id <PID> -Force
   ```
3. Alternatively, launch on custom ports via environment variables:
   ```powershell
   $env:PORT = "3001"
   $env:PYTHON_PORT = "8002"
   npm run dev
   ```

---

## 18. GitHub Repository Preparation

The project is structured cleanly for version control:
* **`.gitignore`** is configured to exclude `node_modules/`, `dist/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, and local development database files (`backend/data/*.db`).
* **Dependency Manifests** (`package.json`, `package-lock.json`, `backend/requirements.txt`) are complete and reproducible.
* **Zero Secrets:** No API keys or credentials are required or committed.

---

## 19. Final Git Push Commands

To initialize Git and push this project to your GitHub account:

```powershell
# 1. Initialize git in the project root:
git init

# 2. Stage all source files (verifies .gitignore exclusions):
git add .

# 3. Create your first commit:
git commit -m "feat: complete FinGuard AI financial data quality platform"

# 4. Set default branch to main:
git branch -M main

# 5. Link your GitHub repository (replace with your repo URL):
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/finguard-ai.git

# 6. Push to GitHub:
git push -u origin main
```

---

## 20. Technical Interview Preparation Guide

### A. 30-Second Elevator Pitch
> *"FinGuard AI is an enterprise financial data quality and audit platform built for credit rating pipelines. It ingests SEC financial statement filings, runs deterministic SQL validation checks—such as profit equation reconciliation and duplicate composite key detection—and transactionally records all accepted records, findings, and audit runs in SQLite. It ensures quantitative credit scorecards never consume corrupted or unreconciled financial data."*

### B. 60-Second Technical Architecture Overview
> *"The application follows a full-stack data engineering architecture. The frontend is built in React 19 and TypeScript, communicating through an Express reverse proxy to a Python FastAPI backend. When a CSV is uploaded, Pandas normalizes headers and preserves raw string inputs to track OCR or footnote artifacts. A deterministic validation engine applies mathematical rules, such as verifying that reported profit balances with revenue minus operating expenses within a configurable tolerance.*  
> *All writes use atomic SQLite transactions with foreign key enforcement. A dedicated `ingestion_runs` table tracks batch status, while `audit_events` logs immutable lifecycle events. The dashboard calculates verified record pass rates and isolates financial totals by currency code to prevent mixed-currency aggregation."*

---

### C. Core Concept Questions & Model Answers

#### 1. Why use SQL for data validation instead of writing custom code in JavaScript or Python?
* **Model Answer:** *"SQL is declarative, set-based, and operates directly where the data lives. Writing validation rules in SQL ensures database-level enforcement, eliminates discrepancies between different frontend clients, and leverages database indexing on foreign keys and business identifiers like `(company_id, period)`. While Pandas is ideal for ingestion and string parsing, SQL ensures transactional consistency and immutable audit constraints."*

#### 2. Why choose SQLite over PostgreSQL or Cloud SQL for this application?
* **Model Answer:** *"SQLite is serverless, zero-configuration, and fully ACID-compliant. It stores the entire relational database in a single local file (`finguard.db`), making it fast, deterministic, and ideal for edge analytics, local testing, and offline developer workflows without running heavy background database daemons. However, because SQLite uses database-level locking for writes, in an enterprise distributed environment with hundreds of concurrent data pipelines, I would migrate the schema to PostgreSQL."*

#### 3. What is Pandas' specific role in the ingestion pipeline?
* **Model Answer:** *"Pandas handles the untrusted boundary between raw CSV files and our relational database. It normalizes inconsistent header aliases, strips surrounding whitespace, detects empty or malformed inputs, and maintains raw string copies of numeric fields so footnote characters (like `29,840.50*`) can be flagged without premature conversion to `NaN`."*

#### 4. How do you distinguish between data errors and statistical anomalies?
* **Model Answer:** *"In FinGuard AI, we classify issues into two strict tiers: Confirmed Failures (CRITICAL) and Unusual Values (WARNING). A Confirmed Failure is an objective violation of accounting or schema rules—such as a missing company ID, a duplicate filing tuple, or an arithmetic contradiction where profit does not equal revenue minus expenses. An Unusual Value is mathematically valid but statistically rare—such as a company reporting an 88% operating margin or a revenue figure three standard deviations from peer averages. Distinguishing them prevents halting pipelines for legitimate high-margin businesses while strictly blocking corrupted data."*

#### 5. How are database transactions used to guarantee audit lineage?
* **Model Answer:** *"All writes during an ingestion run—company metadata upserts, financial record insertions, validation findings, and audit log entries—are wrapped inside a single atomic SQLite transaction (`with conn:`). If any row violates a constraint or database exception occurs, SQLite automatically issues a `ROLLBACK`. This prevents partial writes, ensuring the database never contains orphaned filings without corresponding audit runs."*

---

## 21. Honest Project Limitations

* **Single-Node SQLite Write Concurrency:** SQLite supports unlimited concurrent readers but serializes write transactions. For enterprise scale with multiple concurrent data ingestion workers, the schema is designed to transition directly to PostgreSQL.
* **No Real-Time Currency Conversion:** FinGuard AI intentionally isolates totals by currency code (`USD`, `EUR`, `GBP`) rather than synthesizing live exchange rates, ensuring zero currency hallucination.

---

## 22. License

MIT License. Developed for educational portfolio demonstration and data engineering evaluation.
