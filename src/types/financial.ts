/**
 * FinGuard AI - Financial Data Intelligence Type Definitions
 * Enterprise Credit Rating Data Engineering Pipeline
 */

export type Sector = 
  | 'Technology' 
  | 'Financials' 
  | 'Healthcare' 
  | 'Energy' 
  | 'Consumer' 
  | 'Industrials';

export type ValidationSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type IssueType = 'CONFIRMED_FAILURE' | 'UNUSUAL_VALUE';

export type ValidationRuleId =
  | 'RULE_MATH_PROFIT_MISMATCH'
  | 'RULE_MISSING_VALUE'
  | 'RULE_DUPLICATE_KEY'
  | 'RULE_INVALID_NUMERIC'
  | 'RULE_NEGATIVE_REVENUE'
  | 'RULE_NEGATIVE_EXPENSE'
  | 'RULE_INCONSISTENT_PERIOD'
  | 'RULE_STATISTICAL_OUTLIER'
  | 'RULE_MARGIN_ANOMALY';

export interface DownstreamImpact {
  metric: string;
  deviation: string;
  ratingRisk: string;
  explanation: string;
}

export interface ValidationIssue {
  id: string;
  recordId: string;
  companyId: string | null;
  companyName: string | null;
  period: string;
  rowNumber: number;
  rowIdentifier: string; // e.g. "Row #2"
  column: 'companyId' | 'revenue' | 'expenses' | 'reportedProfit' | 'period' | 'multiple' | string;
  field: string; // Required by spec
  ruleId: ValidationRuleId;
  ruleName: string;
  validationRule: string; // Required by spec
  ruleCategory: 'MATHEMATICAL_INTEGRITY' | 'SCHEMA_VALIDATION' | 'STATISTICAL_ANOMALY';
  severity: ValidationSeverity;
  issueType: IssueType;
  description: string;
  explanation: string; // Required by spec
  affectedValue: string | number | null;
  actualValue: string | number | null; // Required by spec
  expectedValue: string | number | null;
  recommendedCheck: string;
  downstreamImpact: DownstreamImpact;
  status: 'OPEN' | 'CORRECTED' | 'ACCEPTED_RISK';
}

export interface FinancialRecord {
  id: string;
  rawLineNumber: number;
  companyId: string | null; // e.g. CIK / LEI
  ticker: string | null;
  companyName: string | null;
  sector: Sector | string | null;
  period: string; // e.g. 2024-Q1
  filingDate: string;
  currency: string | null;
  
  // Numerical figures (in native units as reported in filing, preserving precision)
  revenue: number | null;
  expenses: number | null;
  reportedProfit: number | null;
  
  // String representations before parsing (detects OCR/asterisk artifacts)
  rawRevenue?: string;
  rawExpenses?: string;
  rawReportedProfit?: string;

  // Derived financial metrics
  calculatedProfit: number | null; // revenue - expenses
  profitDiscrepancy: number | null; // reportedProfit - calculatedProfit
  operatingMargin: number | null; // (reportedProfit / revenue) * 100
  ebitda: number | null;
  creditRating: string; // AAA, AA+, AA, A+, BBB+, BBB, etc.

  // Validation metadata
  validationStatus: 'VALID' | 'CRITICAL_FAILURE' | 'ANOMALY_INVESTIGATION';
  issues: ValidationIssue[];
  
  // Correction tracking
  isModified: boolean;
  originalValues?: {
    revenue: number | null;
    expenses: number | null;
    reportedProfit: number | null;
    companyId: string | null;
  };
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  runId: string;
  action: 'RECORD_CORRECTION' | 'RULE_OVERRIDE' | 'BATCH_INGESTION' | 'RECORD_ROLLBACK';
  recordId: string;
  companyId: string | null;
  ticker: string | null;
  field: string;
  beforeValue: string | number | null;
  afterValue: string | number | null;
  user: string;
  justification: string;
  remediationTicket: string;
}

export interface PipelineRun {
  runId: string;
  startedAt: string;
  completedAt: string;
  pipelineStage: string;
  totalRecords: number;
  validRecords: number;
  flaggedRecords: number;
  status: 'SUCCESS' | 'WARNING' | 'FAILED';
  durationMs: number;
  engine: string;
}

export interface SectorStats {
  count: number;
  validCount: number;
  flaggedCount?: number;
  passRate?: number | null;
  revenue: number;
}

export interface DatasetMetrics {
  totalRecords: number;
  validRecords: number;
  flaggedRecords: number;
  confirmedFailures: number;
  unusualValues: number;
  dataQualityScore: number | null; // null if no evaluated records, otherwise (validRecords / totalRecords) * 100
  dataQualityPercentage: number | null; // null if no evaluated records, otherwise (validRecords / totalRecords) * 100
  recordPassRate?: number | null; // Explicit Record Pass Rate
  validityMethod: 'PER_RECORD'; // Validity is evaluated per record (record is valid iff 0 rule violations)
  totalRevenue: number;
  totalReportedProfit: number;
  totalCalculatedProfit: number;
  totalDiscrepancy: number;
  avgOperatingMargin: number;
  sectorBreakdown: Record<string, SectorStats>;
  currencyBreakdown?: Record<string, { count: number; revenue: number; reportedProfit: number }>;
}

export type ActiveTab = 
  | 'dashboard'
  | 'upload'
  | 'records'
  | 'findings'
  | 'audit'
  | 'overview' 
  | 'data-quality' 
  | 'data-explorer' 
  | 'root-cause' 
  | 'audit-trail';
