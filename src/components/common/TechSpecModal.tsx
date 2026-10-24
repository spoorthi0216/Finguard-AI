import React, { useState } from 'react';
import {
  X,
  FileCode,
  Layers,
  GraduationCap,
  Database,
  Terminal,
  CheckCircle2,
  Copy,
  Check,
  Code2,
  ExternalLink,
  BookOpen,
  Cpu,
} from 'lucide-react';

interface TechSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TechSpecModal({ isOpen, onClose }: TechSpecModalProps) {
  const [activeTab, setActiveTab] = useState<'testing' | 'roadmap' | 'architecture' | 'dbt-sql'>('testing');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const dbtSchemaYaml = `version: 2

models:
  - name: stg_financial_filings
    description: "Staging table for ingested SEC 10-Q and 10-K financial statements"
    columns:
      - name: company_id
        description: "SEC Central Index Key (CIK) or Legal Entity Identifier (LEI)"
        tests:
          - not_null

      - name: period
        description: "Fiscal reporting period (e.g., 2024-Q1, 2024-Q2)"
        tests:
          - not_null
          - accepted_values:
              values: ['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4']

      - name: expenses
        description: "Operating expenses in millions USD"
        tests:
          - not_null
          - dbt_expectations.expect_column_values_to_be_between:
              min_value: 0
              inclusive: true

    tests:
      # Composite primary key uniqueness constraint
      - unique:
          column_name: "(company_id || '::' || period)"`;

  const dbtReconciliationSql = `-- tests/assert_profit_arithmetic_reconciliation.sql
-- Financial Ratings Agency DQ Rule: Revenue - Expenses = Reported Profit
-- Discrepancies exceeding $5.0M tolerance halt Gold rating model ingestion.

select
    company_id,
    ticker,
    company_name,
    period,
    revenue,
    expenses,
    reported_profit,
    (revenue - expenses) as calculated_profit,
    abs(reported_profit - (revenue - expenses)) as discrepancy_delta
from {{ ref('stg_financial_filings') }}
where abs(reported_profit - (revenue - expenses)) > 5.0;`;

  const pySparkCode = `# spark_dq_pipeline.py
# Tech Data Engineering Intern - Ratings Pipeline Demonstration
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, abs, when, count, expr

spark = SparkSession.builder.appName("FinGuard-Ratings-Pipeline").getOrCreate()

def run_silver_data_quality_suite(raw_df):
    """
    Executes distributed validation rules across SEC filings.
    Surfaces hard schema exceptions and soft statistical outliers.
    """
    # 1. Math Reconciliation Rule
    math_failures = raw_df.filter(
        abs(col("reported_profit") - (col("revenue") - col("expenses"))) > 5.0
    )
    
    # 2. Negative Expense Constraint
    negative_expenses = raw_df.filter(col("expenses") < 0)
    
    # 3. Duplicate Primary Key Tuples
    duplicate_filings = raw_df.groupBy("company_id", "period") \\
                              .agg(count("*").alias("count")) \\
                              .filter(col("count") > 1)
                              
    # 4. Statistical Anomaly Threshold (Operating Margin > 85%)
    margin_anomalies = raw_df.filter(
        (col("reported_profit") / col("revenue") * 100) > 85.0
    )

    return {
        "math_failures": math_failures,
        "negative_expenses": negative_expenses,
        "duplicate_filings": duplicate_filings,
        "margin_anomalies": margin_anomalies
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-[#0B132B] text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  FinGuard AI — Data Engineering Intern Architecture Spec
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-400/20 text-teal-300 font-bold border border-teal-400/30">
                  PORTFOLIO SHOWCASE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Targeting: Tech Data Engineering Intern at a Financial Ratings Company
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('testing')}
            className={`py-3 px-4 border-b-2 transition-all cursor-pointer ${
              activeTab === 'testing'
                ? 'border-teal-600 text-teal-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            1. How to Test Applet
          </button>
          <button
            onClick={() => setActiveTab('roadmap')}
            className={`py-3 px-4 border-b-2 transition-all cursor-pointer ${
              activeTab === 'roadmap'
                ? 'border-teal-600 text-teal-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Python & SQL Backend Roadmap
          </button>
          <button
            onClick={() => setActiveTab('dbt-sql')}
            className={`py-3 px-4 border-b-2 transition-all cursor-pointer ${
              activeTab === 'dbt-sql'
                ? 'border-teal-600 text-teal-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            3. dbt & PySpark Code Specs
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`py-3 px-4 border-b-2 transition-all cursor-pointer ${
              activeTab === 'architecture'
                ? 'border-teal-600 text-teal-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            4. Production Pipeline Architecture
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs text-slate-700 leading-relaxed">
          {/* TAB 1: HOW TO TEST */}
          {activeTab === 'testing' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">
                  Comprehensive Testing & Validation Guide
                </h4>
                <p className="text-slate-500">
                  Follow these step-by-step test workflows to verify all core functional requirements of the applet.
                </p>
              </div>

              <div className="space-y-3">
                {/* Step 1 */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center space-x-2 font-bold text-slate-900 mb-1">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-mono">1</span>
                    <span>Test Arithmetic Profit Mismatch (Apple Inc. Q2)</span>
                  </div>
                  <p className="text-slate-600">
                    Navigate to <strong>Data Quality</strong> or <strong>Root-Cause Investigator</strong>. Select Row #2 (Apple Inc. 2024-Q2).
                    Observe: Reported profit is $42,500M while calculated profit (Rev $90,753M - Exp $67,100M) is $23,653M (Δ +$18,847M).
                    Click <strong>Fix</strong> to reconcile reported profit, and note that the change is automatically recorded in the <strong>Audit Trail</strong>!
                  </p>
                </div>

                {/* Step 2 */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center space-x-2 font-bold text-slate-900 mb-1">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-mono">2</span>
                    <span>Test Primary Key Duplicate Collision (Amazon Q2)</span>
                  </div>
                  <p className="text-slate-600">
                    Observe Rows #6 and #7 (Amazon 2024-Q2) which represent a concurrent filing of a 10-Q and 10-Q/A restatement with conflicting expenses.
                    The engine flags this as a <strong>Critical Confirmed Failure</strong> to prevent double-counting in sector aggregates.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center space-x-2 font-bold text-slate-900 mb-1">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-mono">3</span>
                    <span>Test OCR String Artifact & Inverted Expense Sign</span>
                  </div>
                  <p className="text-slate-600">
                    Observe Row #10 (JPMorgan Chase Q2) where expenses contained an OCR footnote artifact <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">"29,840.50*"</code>,
                    and Row #12 (ExxonMobil Q2) where operating expenses were inverted to negative <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">-$71,200M</code>.
                    Click <strong>Fix</strong> to apply regex sanitation and absolute-value inversion.
                  </p>
                </div>

                {/* Step 4 */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center space-x-2 font-bold text-slate-900 mb-1">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-mono">4</span>
                    <span>Test Immutable Audit Trail Lineage & Rollback</span>
                  </div>
                  <p className="text-slate-600">
                    Navigate to <strong>Audit Trail</strong>. View the exact <strong>Original (Before) Value</strong> and <strong>Corrected (After) Value</strong>, ticket ID, and justification.
                    Click <strong>Revert</strong> to instantly roll back the record to its original synthetic state.
                  </p>
                </div>

                {/* Step 5 */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center space-x-2 font-bold text-slate-900 mb-1">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-mono">5</span>
                    <span>Test AI Assistant Reasoning & Zero-Fabrication Transparency</span>
                  </div>
                  <p className="text-slate-600">
                    Navigate to <strong>AI Assistant</strong>. Click a suggested prompt chip like "Why does Apple Inc. Q2 reported profit mismatch Revenue - Expenses?".
                    The assistant analyzes actual numbers, explains footnote causes and downstream credit rating risks, and provides exact dbt SQL code without hallucination.
                  </p>
                </div>

                {/* Step 6 */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center space-x-2 font-bold text-slate-900 mb-1">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-mono">6</span>
                    <span>Test Loading Custom CSV & Stress Test Batches</span>
                  </div>
                  <p className="text-slate-600">
                    Click <strong>Load CSV Data</strong> in the header. Select <strong>High-Anomaly Stress Test</strong> (12 corruptions) or <strong>Clean Gold Dataset</strong> (100% pass),
                    or upload your own CSV file. The pipeline immediately re-evaluates and recalculates all metrics.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ROADMAP */}
          {activeTab === 'roadmap' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">
                  Production Roadmap: Features to be Implemented in Python & SQL
                </h4>
                <p className="text-slate-500">
                  While this web applet delivers an interactive, deterministic evaluation engine in React + TypeScript + Express,
                  an enterprise financial ratings agency infrastructure requires dedicated backend components in Python and SQL.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <span className="font-bold text-slate-900 block flex items-center space-x-2">
                    <Terminal className="w-4 h-4 text-teal-600" />
                    <span>Python Backend Pipeline Components</span>
                  </span>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-600 text-[11px]">
                    <li><strong>Apache Airflow / Prefect DAGs:</strong> Automated ingestion schedule querying SEC EDGAR RSS feed and XBRL filing endpoints.</li>
                    <li><strong>PySpark Distributed Ingestion:</strong> Scalable processing for high-volume tick data and multi-decade corporate balance sheet histories.</li>
                    <li><strong>Great Expectations Suite:</strong> Automated schema contract assertions generating HTML data docs for compliance officers.</li>
                    <li><strong>PDF & XBRL Parsing Microservice:</strong> Fast extraction using Python <code className="font-mono bg-slate-200 px-1 rounded">sec-edgar-downloader</code> and <code className="font-mono bg-slate-200 px-1 rounded">arelle</code> XBRL parser.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <span className="font-bold text-slate-900 block flex items-center space-x-2">
                    <Database className="w-4 h-4 text-teal-600" />
                    <span>SQL & Data Warehouse Components</span>
                  </span>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-600 text-[11px]">
                    <li><strong>Snowflake / BigQuery / PostgreSQL:</strong> Relational staging (Bronze), validated dimensional models (Silver), and credit rating aggregates (Gold).</li>
                    <li><strong>dbt Core / dbt Cloud Models:</strong> Modular SQL transformations with automated CI/CD schema testing and lineage graphs.</li>
                    <li><strong>Apache Iceberg / Delta Lake:</strong> ACID table formats enabling time-travel queries for historical audit investigations.</li>
                    <li><strong>Stored Procedures for Financial Restatements:</strong> Automated reconciliation logic handling 10-Q/A amended filings and versioning.</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                <span className="font-bold block">Application Prototype Limitations:</span>
                <p className="text-[11px] leading-relaxed">
                  The current dashboard runs client-side simulation logic paired with a server-side Gemini 3.8 Flash proxy.
                  It executes over curated in-memory batches rather than multi-terabyte cloud lakes. In production, this UI would serve as the Data Steward Command Portal integrated with Snowflake via REST/JDBC.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: DBT & SQL CODE SPECS */}
          {activeTab === 'dbt-sql' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">
                  Enterprise Production Code Specifications
                </h4>
                <p className="text-slate-500">
                  Ready-to-deploy dbt YAML tests, singular reconciliation queries, and PySpark data quality suites.
                </p>
              </div>

              {/* dbt schema test */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                  <span>1. dbt Schema Specification (schema.yml)</span>
                  <button
                    onClick={() => copyToClipboard(dbtSchemaYaml, 'dbt-yaml')}
                    className="flex items-center space-x-1 text-teal-600 hover:text-teal-700 cursor-pointer"
                  >
                    {copiedCode === 'dbt-yaml' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode === 'dbt-yaml' ? 'Copied' : 'Copy YAML'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-xl bg-[#0F172A] text-slate-100 font-mono text-[11px] overflow-x-auto border border-slate-800">
                  {dbtSchemaYaml}
                </pre>
              </div>

              {/* SQL reconciliation */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                  <span>2. Singular Profit Reconciliation Test (tests/assert_profit_arithmetic_reconciliation.sql)</span>
                  <button
                    onClick={() => copyToClipboard(dbtReconciliationSql, 'dbt-sql')}
                    className="flex items-center space-x-1 text-teal-600 hover:text-teal-700 cursor-pointer"
                  >
                    {copiedCode === 'dbt-sql' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode === 'dbt-sql' ? 'Copied' : 'Copy SQL'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-xl bg-[#0F172A] text-slate-100 font-mono text-[11px] overflow-x-auto border border-slate-800">
                  {dbtReconciliationSql}
                </pre>
              </div>

              {/* PySpark code */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                  <span>3. PySpark Distributed Quality Suite (spark_dq_pipeline.py)</span>
                  <button
                    onClick={() => copyToClipboard(pySparkCode, 'pyspark')}
                    className="flex items-center space-x-1 text-teal-600 hover:text-teal-700 cursor-pointer"
                  >
                    {copiedCode === 'pyspark' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode === 'pyspark' ? 'Copied' : 'Copy Python'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-xl bg-[#0F172A] text-slate-100 font-mono text-[11px] overflow-x-auto border border-slate-800">
                  {pySparkCode}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 4: ARCHITECTURE */}
          {activeTab === 'architecture' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">
                  Medallion Architecture for Credit Rating Data Engineering
                </h4>
                <p className="text-slate-500">
                  How FinGuard AI fits into an enterprise credit surveillance data pipeline at a major rating agency.
                </p>
              </div>

              <div className="space-y-3 font-mono text-[11px]">
                {/* Bronze */}
                <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/50 space-y-1">
                  <span className="font-bold text-amber-900 text-xs">BRONZE LAYER (Raw Staging)</span>
                  <p className="text-slate-600">
                    Raw JSON/XBRL payloads from SEC EDGAR 10-Q, 10-K, and 8-K feeds landed in cloud object storage (S3/GCS).
                    Preserves original string representations, unparsed footnotes, and raw ingestion timestamps.
                  </p>
                </div>

                {/* Silver */}
                <div className="p-4 rounded-xl border border-teal-300 bg-teal-50/50 space-y-1">
                  <span className="font-bold text-teal-900 text-xs">SILVER LAYER (Cleaned & Validated via FinGuard AI)</span>
                  <p className="text-slate-600">
                    Where FinGuard AI rules execute: Deduplication of amendment filings (10-Q/A), regex sanitization of OCR artifacts,
                    arithmetic reconciliation of Revenue - Expenses = Profit, and statistical outlier isolation.
                  </p>
                </div>

                {/* Gold */}
                <div className="p-4 rounded-xl border border-indigo-300 bg-indigo-50/50 space-y-1">
                  <span className="font-bold text-indigo-900 text-xs">GOLD LAYER (Credit Rating Scorecards & Analytics)</span>
                  <p className="text-slate-600">
                    Curated, verified financial ratios feeding automated credit committee models: Debt/EBITDA leverage,
                    Interest Coverage Ratio (ICR), and Altman Z-score distress models for rating analysts.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            Candidate Portfolio Project • Tech Data Engineering Intern Spec
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Close Spec
          </button>
        </div>
      </div>
    </div>
  );
}
