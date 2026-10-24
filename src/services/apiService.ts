/**
 * FinGuard AI — Frontend API Client Service (Stage 4)
 * Provides typed communication with the authoritative Python FastAPI service
 * via the Express reverse proxy (/api/py/*).
 */

import {
  FinancialRecord,
  ValidationIssue,
  DatasetMetrics,
  AuditLogEntry,
  Sector,
} from '../types/financial';

export interface PythonHealthStatus {
  isOnline: boolean;
  statusText: string;
  version?: string;
  port?: number;
  database?: {
    configured: boolean;
    status: string;
    path?: string;
    tables?: string[];
  };
  engine?: {
    name: string;
    status: string;
    authoritative: boolean;
  };
  error?: string;
}

export interface IngestionApiResponse {
  run_id: string;
  total_records: number;
  valid_records: number;
  flagged_records: number;
  confirmed_failures: number;
  unusual_values: number;
  data_quality_percentage: number;
  validation_findings: any[];
  records: any[];
  metadata: Record<string, any>;
}

/**
 * Transforms the Python FastAPI backend response into frontend domain models
 * (FinancialRecord[], ValidationIssue[], and DatasetMetrics).
 */
export function transformPythonIngestionResponse(data: IngestionApiResponse): {
  records: FinancialRecord[];
  allIssues: ValidationIssue[];
  metrics: DatasetMetrics;
  runId: string;
} {
  const rawFindings = data.validation_findings || [];
  const rawRecords = data.records || [];

  const recordMap = new Map<string, any>();
  for (const r of rawRecords) {
    recordMap.set(r.id, r);
  }

  const mappedIssues: ValidationIssue[] = rawFindings.map((f: any, idx: number) => {
    const parentRec = recordMap.get(f.record_id);
    const rowNum = f.row_number || parentRec?.raw_payload?.row_number || parentRec?.rawLineNumber || idx + 1;
    const colName = f.column_name || 'multiple';

    let col: ValidationIssue['column'] = 'multiple';
    if (colName === 'company_id' || colName === 'companyId') col = 'companyId';
    else if (colName === 'revenue') col = 'revenue';
    else if (colName === 'expenses') col = 'expenses';
    else if (colName === 'reported_profit' || colName === 'reportedProfit') col = 'reportedProfit';
    else if (colName === 'period') col = 'period';

    const ruleCategory: ValidationIssue['ruleCategory'] =
      f.rule_id === 'RULE_MATH_PROFIT_MISMATCH'
        ? 'MATHEMATICAL_INTEGRITY'
        : f.rule_id === 'RULE_STATISTICAL_OUTLIER' || f.rule_id === 'RULE_MARGIN_ANOMALY'
        ? 'STATISTICAL_ANOMALY'
        : 'SCHEMA_VALIDATION';

    const ruleName = f.rule_name || 'Validation Constraint';
    const desc =
      f.description ||
      `${ruleName}: affected value '${f.affected_value ?? 'NULL'}' expected '${f.expected_value ?? 'valid'}'`;

    const resolvedCompanyId = f.company_id ?? parentRec?.company_id ?? parentRec?.companyId ?? null;
    const resolvedCompanyName = f.company_name ?? parentRec?.company_name ?? parentRec?.companyName ?? null;
    const resolvedPeriod = f.period ?? parentRec?.period ?? 'N/A';

    return {
      id: f.id || `issue-${idx}`,
      recordId: f.record_id,
      companyId: resolvedCompanyId,
      companyName: resolvedCompanyName,
      period: resolvedPeriod,
      rowNumber: rowNum,
      rowIdentifier: `Row #${rowNum}`,
      column: col,
      field: colName,
      ruleId: f.rule_id || 'RULE_MISSING_VALUE',
      ruleName: ruleName,
      validationRule: ruleName,
      ruleCategory,
      severity: f.severity || (f.issue_type === 'CONFIRMED_FAILURE' ? 'CRITICAL' : 'WARNING'),
      issueType: f.issue_type || (f.severity === 'CRITICAL' ? 'CONFIRMED_FAILURE' : 'UNUSUAL_VALUE'),
      description: desc,
      explanation: desc,
      affectedValue: f.affected_value ?? null,
      actualValue: f.affected_value ?? null,
      expectedValue: f.expected_value ?? null,
      recommendedCheck:
        f.recommended_check || 'Verify SEC 10-Q filing table and XBRL footnote tag taxonomy.',
      downstreamImpact: f.downstream_impact || {
        metric: col === 'reportedProfit' ? 'Operating Margin & EBITDA' : 'Credit Scoring Engine',
        deviation: `${f.affected_value ?? 'N/A'} vs ${f.expected_value ?? 'N/A'}`,
        ratingRisk:
          f.severity === 'CRITICAL'
            ? 'Distorted leverage ratios may skew credit committee scorecard.'
            : 'Minor statistical outlier review.',
        explanation: 'Deterministic validation failed on authoritative Python / Pandas ingestion pipeline.',
      },
      status: (f.status as any) || 'OPEN',
    };
  });

  const issuesByRec = new Map<string, ValidationIssue[]>();
  for (const issue of mappedIssues) {
    const list = issuesByRec.get(issue.recordId) || [];
    list.push(issue);
    issuesByRec.set(issue.recordId, list);
  }

  const mappedRecords: FinancialRecord[] = rawRecords.map((r: any) => {
    const recIssues = issuesByRec.get(r.id) || [];
    const compId = r.company_id !== undefined ? r.company_id : (r.companyId !== undefined ? r.companyId : null);
    const compName = r.company_name !== undefined ? r.company_name : (r.companyName !== undefined ? r.companyName : null);
    const tickerVal = r.ticker !== undefined ? r.ticker : null;
    const sectorVal = r.sector !== undefined ? r.sector : null;

    return {
      id: r.id,
      rawLineNumber: r.raw_payload?.row_number || r.rawLineNumber || 1,
      companyId: compId,
      ticker: tickerVal,
      companyName: compName,
      sector: sectorVal,
      period: r.period || '',
      filingDate: r.filing_date || r.filingDate || '2024-01-01',
      currency: r.currency ? String(r.currency).trim().toUpperCase() : null,
      revenue: r.revenue ?? null,
      expenses: r.expenses ?? null,
      reportedProfit: r.reported_profit ?? r.reportedProfit ?? null,
      rawRevenue: r.raw_payload?.raw_revenue ?? r.rawRevenue,
      rawExpenses: r.raw_payload?.raw_expenses ?? r.rawExpenses,
      rawReportedProfit: r.raw_payload?.raw_reported_profit ?? r.rawReportedProfit,
      calculatedProfit: r.calculated_profit ?? r.calculatedProfit ?? null,
      profitDiscrepancy: r.profit_discrepancy ?? r.profitDiscrepancy ?? null,
      operatingMargin: r.operating_margin ?? r.operatingMargin ?? null,
      ebitda: r.ebitda ?? null,
      creditRating: r.credit_rating ?? r.creditRating ?? 'BBB',
      validationStatus:
        r.validation_status ??
        r.validationStatus ??
        (recIssues.some((i) => i.severity === 'CRITICAL')
          ? 'CRITICAL_FAILURE'
          : recIssues.length > 0
          ? 'ANOMALY_INVESTIGATION'
          : 'VALID'),
      issues: recIssues,
      isModified: false,
      originalValues: {
        revenue: r.revenue ?? null,
        expenses: r.expenses ?? null,
        reportedProfit: r.reported_profit ?? r.reportedProfit ?? null,
        companyId: compId,
      },
    };
  });

  const totalRecs = data.total_records ?? mappedRecords.length;
  const validRecs =
    data.valid_records ?? mappedRecords.filter((r) => r.validationStatus === 'VALID').length;
  const flaggedRecs =
    data.flagged_records ?? mappedRecords.filter((r) => r.validationStatus !== 'VALID').length;
  const confirmedFailures =
    data.confirmed_failures ??
    mappedRecords.filter((r) => r.validationStatus === 'CRITICAL_FAILURE').length;
  const unusualValues =
    data.unusual_values ??
    mappedRecords.filter((r) => r.validationStatus === 'ANOMALY_INVESTIGATION').length;
  const dqScore: number | null =
    data.data_quality_percentage !== undefined && data.data_quality_percentage !== null
      ? data.data_quality_percentage
      : totalRecs > 0
      ? Math.round((validRecs / totalRecs) * 1000) / 10
      : null;

  const sectorBreakdown: Record<string, { count: number; validCount: number; flaggedCount: number; passRate: number | null; revenue: number }> = {
    Technology: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
    Financials: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
    Healthcare: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
    Energy: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
    Consumer: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
    Industrials: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
  };

  let totalRevenue = 0;
  let totalReportedProfit = 0;
  let totalCalculatedProfit = 0;
  let marginSum = 0;
  let marginCount = 0;

  for (const rec of mappedRecords) {
    if (rec.revenue !== null) totalRevenue += rec.revenue;
    if (rec.reportedProfit !== null) totalReportedProfit += rec.reportedProfit;
    if (rec.calculatedProfit !== null) totalCalculatedProfit += rec.calculatedProfit;
    if (rec.operatingMargin !== null) {
      marginSum += rec.operatingMargin;
      marginCount++;
    }
    const sec = (rec.sector && String(rec.sector).trim()) ? String(rec.sector).trim() : 'Unassigned';
    if (!sectorBreakdown[sec]) {
      sectorBreakdown[sec] = { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 };
    }
    sectorBreakdown[sec].count++;
    if (rec.validationStatus === 'VALID') {
      sectorBreakdown[sec].validCount++;
    } else {
      sectorBreakdown[sec].flaggedCount++;
    }
    if (rec.revenue !== null) {
      sectorBreakdown[sec].revenue += rec.revenue;
    }
  }

  for (const sData of Object.values(sectorBreakdown)) {
    sData.passRate = sData.count > 0 ? Math.round((sData.validCount / sData.count) * 1000) / 10 : null;
  }

  const metrics: DatasetMetrics = {
    totalRecords: totalRecs,
    validRecords: validRecs,
    flaggedRecords: flaggedRecs,
    confirmedFailures,
    unusualValues,
    dataQualityScore: dqScore,
    dataQualityPercentage: dqScore,
    recordPassRate: dqScore,
    validityMethod: 'PER_RECORD',
    totalRevenue,
    totalReportedProfit,
    totalCalculatedProfit,
    totalDiscrepancy: Math.round((totalReportedProfit - totalCalculatedProfit) * 100) / 100,
    avgOperatingMargin: marginCount > 0 ? Math.round((marginSum / marginCount) * 10) / 10 : 0,
    sectorBreakdown,
  };

  return {
    records: mappedRecords,
    allIssues: mappedIssues,
    metrics,
    runId: data.run_id || `RUN-${Date.now()}`,
  };
}

/**
 * Checks health of the Python FastAPI validation service via Express proxy.
 */
export async function checkPythonHealth(): Promise<PythonHealthStatus> {
  try {
    const res = await fetch('/api/py/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      return {
        isOnline: data.status === 'online',
        statusText: data.status === 'online' ? 'Python FastAPI Online' : 'Python Service Degraded',
        version: data.version,
        port: data.port,
        database: data.database,
        engine: data.engine,
      };
    }

    return {
      isOnline: false,
      statusText: `Python Service Offline (HTTP ${res.status})`,
      error: `Proxy responded with status ${res.status}`,
    };
  } catch (err: any) {
    return {
      isOnline: false,
      statusText: 'Python Service Unreachable',
      error: err?.message || 'Network error reaching /api/py/health',
    };
  }
}

/**
 * Uploads a CSV file or raw CSV text to the Python /ingest endpoint.
 * When uploading a File, relies on browser boundary generation (no manual Content-Type).
 */
export async function ingestCsvToPython(
  fileOrText: File | string,
  profitTolerance: number = 5.0
): Promise<{ success: boolean; data?: IngestionApiResponse; error?: string }> {
  try {
    let response: Response;

    if (fileOrText instanceof File) {
      const formData = new FormData();
      formData.append('file', fileOrText);
      formData.append('profit_tolerance', profitTolerance.toString());

      // Notice: Do NOT manually set Content-Type header.
      // Browser automatically injects multipart/form-data with boundary.
      response = await fetch('/api/py/ingest', {
        method: 'POST',
        body: formData,
      });
    } else {
      // JSON body with csv_text
      response = await fetch('/api/py/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_text: fileOrText,
          profit_tolerance: profitTolerance,
        }),
      });
    }

    if (response.ok) {
      const data: IngestionApiResponse = await response.json();
      return { success: true, data };
    }

    const errData = await response.json().catch(() => ({}));
    const message = errData?.detail?.message || errData?.detail || `Ingestion failed (${response.status})`;
    return { success: false, error: message };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to connect to /api/py/ingest' };
  }
}

/**
 * Validates a CSV file or raw text without writing to SQLite.
 */
export async function validateCsvWithPython(
  fileOrText: File | string,
  profitTolerance: number = 5.0
): Promise<{ success: boolean; data?: IngestionApiResponse; error?: string }> {
  try {
    let response: Response;

    if (fileOrText instanceof File) {
      const formData = new FormData();
      formData.append('file', fileOrText);
      formData.append('profit_tolerance', profitTolerance.toString());

      response = await fetch('/api/py/validate', {
        method: 'POST',
        body: formData,
      });
    } else {
      response = await fetch('/api/py/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_text: fileOrText,
          profit_tolerance: profitTolerance,
        }),
      });
    }

    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }

    const errData = await response.json().catch(() => ({}));
    return { success: false, error: errData?.detail?.message || errData?.detail || `Validation failed (${response.status})` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to connect to /api/py/validate' };
  }
}

/**
 * Retrieves persisted financial records from SQLite.
 */
export async function fetchPersistedRecords(): Promise<FinancialRecord[] | null> {
  try {
    const res = await fetch('/api/py/records');
    if (res.ok) {
      const data = await res.json();
      const raw = data.records || [];
      return raw.map((r: any) => ({
        id: r.id,
        rawLineNumber: r.rawLineNumber || 1,
        companyId: r.companyId ?? r.company_id ?? null,
        ticker: r.ticker ?? null,
        companyName: r.companyName ?? r.company_name ?? null,
        sector: r.sector ?? null,
        period: r.period || '',
        filingDate: r.filingDate || r.filing_date || '2024-01-01',
        currency: r.currency ? String(r.currency).trim().toUpperCase() : null,
        revenue: r.revenue ?? null,
        expenses: r.expenses ?? null,
        reportedProfit: r.reportedProfit ?? r.reported_profit ?? null,
        rawRevenue: r.rawRevenue,
        rawExpenses: r.rawExpenses,
        rawReportedProfit: r.rawReportedProfit,
        calculatedProfit: r.calculatedProfit ?? r.calculated_profit ?? null,
        profitDiscrepancy: r.profitDiscrepancy ?? r.profit_discrepancy ?? null,
        operatingMargin: r.operatingMargin ?? r.operating_margin ?? null,
        ebitda: r.ebitda ?? 0,
        creditRating: r.creditRating ?? r.credit_rating ?? 'BBB',
        validationStatus: r.validationStatus ?? r.validation_status ?? 'VALID',
        issues: (r.issues || []).map((f: any, idx: number) => {
          const rowNum = r.rawLineNumber || idx + 1;
          const colName = f.column_name || 'multiple';
          const ruleName = f.rule_name || 'Validation Constraint';
          const desc = f.description || `${ruleName}: affected '${f.affected_value}'`;
          return {
            id: f.id || `issue-${r.id}-${idx}`,
            recordId: f.record_id || r.id,
            companyId: f.company_id ?? r.companyId ?? null,
            companyName: f.company_name ?? r.companyName ?? null,
            period: f.period ?? r.period ?? 'N/A',
            rowNumber: rowNum,
            rowIdentifier: `Row #${rowNum}`,
            column: colName,
            field: colName,
            ruleId: f.rule_id || 'RULE_MISSING_VALUE',
            ruleName: ruleName,
            validationRule: ruleName,
            ruleCategory:
              f.rule_id === 'RULE_MATH_PROFIT_MISMATCH'
                ? 'MATHEMATICAL_INTEGRITY'
                : f.rule_id === 'RULE_STATISTICAL_OUTLIER' || f.rule_id === 'RULE_MARGIN_ANOMALY'
                ? 'STATISTICAL_ANOMALY'
                : 'SCHEMA_VALIDATION',
            severity: f.severity || 'WARNING',
            issueType: f.issue_type || 'CONFIRMED_FAILURE',
            description: desc,
            explanation: desc,
            affectedValue: f.affected_value ?? null,
            actualValue: f.affected_value ?? null,
            expectedValue: f.expected_value ?? null,
            recommendedCheck: f.recommended_check || 'Review financial filing values.',
            downstreamImpact: f.downstream_impact || {
              metric: 'Financial Integrity',
              deviation: `${f.affected_value ?? 'N/A'} vs ${f.expected_value ?? 'N/A'}`,
              ratingRisk: 'Review required.',
              explanation: 'Validation issue detected on authoritative SQLite store.',
            },
            status: f.status || 'OPEN',
          };
        }),
        isModified: Boolean(r.isModified),
        originalValues: {
          revenue: r.revenue ?? null,
          expenses: r.expenses ?? null,
          reportedProfit: r.reportedProfit ?? r.reported_profit ?? null,
          companyId: r.companyId ?? r.company_id ?? null,
        },
      }));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Retrieves active validation findings from SQLite.
 */
export async function fetchPersistedFindings(): Promise<ValidationIssue[] | null> {
  try {
    const res = await fetch('/api/py/findings');
    if (res.ok) {
      const data = await res.json();
      const raw = data.findings || [];
      return raw.map((f: any, idx: number) => {
        const rowNum = f.row_number || idx + 1;
        const colName = f.column_name || 'multiple';
        const ruleName = f.rule_name || 'Validation Constraint';
        const desc = `${ruleName}: affected value '${f.affected_value ?? 'NULL'}' expected '${f.expected_value ?? 'valid'}'`;
        return {
          id: f.id || `finding-${idx}`,
          recordId: f.record_id,
          companyId: f.company_id ?? null,
          companyName: f.company_name ?? null,
          period: f.period || 'N/A',
          rowNumber: rowNum,
          rowIdentifier: `Row #${rowNum}`,
          column: colName,
          field: colName,
          ruleId: f.rule_id || 'RULE_MISSING_VALUE',
          ruleName: ruleName,
          validationRule: ruleName,
          ruleCategory:
            f.rule_id === 'RULE_MATH_PROFIT_MISMATCH'
              ? 'MATHEMATICAL_INTEGRITY'
              : f.rule_id === 'RULE_STATISTICAL_OUTLIER' || f.rule_id === 'RULE_MARGIN_ANOMALY'
              ? 'STATISTICAL_ANOMALY'
              : 'SCHEMA_VALIDATION',
          severity: f.severity || 'WARNING',
          issueType: f.issue_type || 'CONFIRMED_FAILURE',
          description: desc,
          explanation: desc,
          affectedValue: f.affected_value ?? null,
          actualValue: f.affected_value ?? null,
          expectedValue: f.expected_value ?? null,
          recommendedCheck: 'Verify SEC 10-Q filing table and XBRL footnote tag taxonomy.',
          downstreamImpact: {
            metric: 'Credit Scoring Engine',
            deviation: `${f.affected_value ?? 'N/A'} vs ${f.expected_value ?? 'N/A'}`,
            ratingRisk:
              f.severity === 'CRITICAL'
                ? 'Distorted leverage ratios may skew credit committee scorecard.'
                : 'Minor statistical outlier review.',
            explanation: 'Deterministic validation finding persisted in authoritative SQLite store.',
          },
          status: f.status || 'OPEN',
        };
      });
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Retrieves immutable audit events from SQLite.
 */
export async function fetchPersistedAuditTrail(): Promise<AuditLogEntry[] | null> {
  try {
    const res = await fetch('/api/py/audit');
    if (res.ok) {
      const data = await res.json();
      return data.audit_events || [];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Retrieves aggregated quality and financial metrics from SQLite.
 */
export async function fetchPersistedMetrics(): Promise<DatasetMetrics | null> {
  try {
    const res = await fetch('/api/py/metrics');
    if (res.ok) {
      const data = await res.json();
      const m = data.metrics;
      if (!m) return null;
      return {
        totalRecords: m.totalRecords ?? 0,
        validRecords: m.validRecords ?? 0,
        flaggedRecords: m.flaggedRecords ?? 0,
        confirmedFailures: m.confirmedFailures ?? 0,
        unusualValues: m.unusualValues ?? 0,
        dataQualityScore: m.dataQualityScore !== undefined ? m.dataQualityScore : null,
        dataQualityPercentage: m.dataQualityPercentage !== undefined ? m.dataQualityPercentage : null,
        recordPassRate: m.recordPassRate !== undefined ? m.recordPassRate : (m.dataQualityPercentage !== undefined ? m.dataQualityPercentage : null),
        validityMethod: 'PER_RECORD',
        totalRevenue: m.totalRevenue ?? 0,
        totalReportedProfit: m.totalReportedProfit ?? 0,
        totalCalculatedProfit: m.totalCalculatedProfit ?? 0,
        totalDiscrepancy: m.totalDiscrepancy ?? 0,
        avgOperatingMargin: m.avgOperatingMargin ?? 0,
        sectorBreakdown: m.sectorBreakdown || m.sector_breakdown || {
          Technology: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
          Financials: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
          Healthcare: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
          Energy: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
          Consumer: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
          Industrials: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
        },
        currencyBreakdown: m.currencyBreakdown || m.currency_breakdown || undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export interface IngestionRunItem {
  runId: string;
  filename: string;
  startedAt: string;
  completedAt?: string | null;
  totalRows: number;
  acceptedRecords: number;
  rejectedRecords: number;
  findingsCount: number;
  status: 'SUCCESS' | 'SUCCESS_WITH_WARNINGS' | 'COMPLETED_WITH_ERRORS' | 'FAILED';
  errorSummary?: string | null;
}

/**
 * Retrieves tracked ingestion runs from SQLite.
 */
export async function fetchPersistedRuns(): Promise<IngestionRunItem[] | null> {
  try {
    const res = await fetch('/api/py/runs');
    if (res.ok) {
      const data = await res.json();
      const rawRuns = data.runs || [];
      return rawRuns.map((r: any) => ({
        runId: r.runId || r.run_id || '',
        filename: r.filename || 'unknown.csv',
        startedAt: r.startedAt || r.started_at || '',
        completedAt: r.completedAt || r.completed_at || null,
        totalRows: Number(r.totalRows ?? r.total_rows ?? 0),
        acceptedRecords: Number(r.acceptedRecords ?? r.accepted_records ?? 0),
        rejectedRecords: Number(r.rejectedRecords ?? r.rejected_records ?? 0),
        findingsCount: Number(r.findingsCount ?? r.findings_count ?? 0),
        status: (r.status || 'SUCCESS') as IngestionRunItem['status'],
        errorSummary: r.errorSummary || r.error_summary || null,
      }));
    }
    console.warn(`[FinGuard] /api/py/runs responded with status ${res.status}`);
    return null;
  } catch (err) {
    console.warn('[FinGuard] Error fetching ingestion runs from /api/py/runs:', err);
    return null;
  }
}


