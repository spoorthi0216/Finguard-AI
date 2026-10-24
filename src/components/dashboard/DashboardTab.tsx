import React from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Clock,
  ArrowRight,
  Database,
  Layers,
} from 'lucide-react';
import { DatasetMetrics, FinancialRecord } from '../../types/financial';
import { IngestionRunItem } from '../../services/apiService';

interface DashboardTabProps {
  metrics: DatasetMetrics;
  records: FinancialRecord[];
  latestRun?: IngestionRunItem | null;
  onNavigateToUpload: () => void;
  onNavigateToFindings: () => void;
  onNavigateToRecords: () => void;
}

export function DashboardTab({
  metrics,
  records,
  latestRun,
  onNavigateToUpload,
  onNavigateToFindings,
  onNavigateToRecords,
}: DashboardTabProps) {
  const hasData = metrics.totalRecords > 0;
  const passRateDisplay =
    metrics.recordPassRate !== null && metrics.recordPassRate !== undefined
      ? `${metrics.recordPassRate.toFixed(1)}%`
      : 'No data';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Data Quality Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time quality metrics calculated directly from authoritative SQLite financial records and validation findings.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onNavigateToUpload}
            className="inline-flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-2xs transition"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload New CSV</span>
          </button>
        </div>
      </div>

      {/* Empty State Banner if 0 records */}
      {!hasData && (
        <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">No Financial Records Ingested</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Your database is currently empty. Upload the included synthetic CSV to evaluate validation rules and view real metrics.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateToUpload}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition"
          >
            <span>Go to Upload Screen</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 5 Core Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Record Pass Rate */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Record Pass Rate</span>
            <ShieldCheck className="w-4 h-4 text-teal-600" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-2xl font-bold font-mono ${hasData ? 'text-slate-900' : 'text-slate-400'}`}>
              {passRateDisplay}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            (Valid Records / Total Evaluated) × 100
          </p>
        </div>

        {/* Card 2: Total Accepted Records */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Records</span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-2xl font-bold font-mono text-slate-900">
            {metrics.totalRecords}
          </span>
          <p className="text-[11px] text-slate-400 mt-1">
            Persisted in SQLite ledger
          </p>
        </div>

        {/* Card 3: Valid Records */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Valid Records</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-bold font-mono text-emerald-700">
            {metrics.validRecords}
          </span>
          <p className="text-[11px] text-emerald-600/80 mt-1 font-medium">
            Satisfied 100% mandatory rules
          </p>
        </div>

        {/* Card 4: Flagged Records */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Flagged Records</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <span className="text-2xl font-bold font-mono text-rose-700">
            {metrics.flaggedRecords}
          </span>
          <p className="text-[11px] text-slate-500 mt-1">
            {metrics.confirmedFailures} errors • {metrics.unusualValues} warnings
          </p>
        </div>

        {/* Card 5: Latest Ingestion Run */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Latest Run</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          {latestRun ? (
            <div>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                latestRun.status === 'SUCCESS'
                  ? 'bg-emerald-100 text-emerald-800'
                  : latestRun.status === 'SUCCESS_WITH_WARNINGS'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}>
                {latestRun.status.replace(/_/g, ' ')}
              </span>
              <p className="text-[11px] text-slate-500 font-mono mt-1 truncate" title={latestRun.runId}>
                {latestRun.runId}
              </p>
            </div>
          ) : (
            <div>
              <span className="text-sm font-medium text-slate-400">No runs logged</span>
              <p className="text-[11px] text-slate-400 mt-1">Ready for first file</p>
            </div>
          )}
        </div>
      </div>

      {/* Main 2-Column Section: Sector Breakdown & Currency Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2 cols): Sector Statistics */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Sector Quality Statistics</h3>
              <p className="text-xs text-slate-500">
                Calculated per sector using actual persisted company metadata. Single record counting semantics prevent join duplication.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[11px] font-semibold">
                  <th className="py-2.5 px-3">Sector</th>
                  <th className="py-2.5 px-3">Evaluated Filings</th>
                  <th className="py-2.5 px-3">Valid</th>
                  <th className="py-2.5 px-3">Flagged</th>
                  <th className="py-2.5 px-3">Sector Pass Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {Object.entries(metrics.sectorBreakdown).map(([sectorName, sData]) => {
                  const sCount = sData.count || 0;
                  const sValid = sData.validCount || 0;
                  const sFlagged = sData.flaggedCount !== undefined ? sData.flaggedCount : (sCount - sValid);
                  const rateStr = sData.passRate !== null && sData.passRate !== undefined ? `${sData.passRate.toFixed(1)}%` : 'No data';

                  return (
                    <tr key={sectorName} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{sectorName}</td>
                      <td className="py-2.5 px-3 font-mono">{sCount}</td>
                      <td className="py-2.5 px-3 font-mono text-emerald-700 font-medium">{sValid}</td>
                      <td className="py-2.5 px-3 font-mono text-rose-700 font-medium">
                        {sFlagged > 0 ? sFlagged : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          sData.passRate === null
                            ? 'bg-slate-100 text-slate-500'
                            : sData.passRate === 100
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {rateStr}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right (1 col): Multi-Currency Preservation */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
              <DollarSign className="w-4 h-4 text-teal-600" />
              <span>Currency Aggregation Guard</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Financial totals isolated by currency code. Multi-currency values are never combined into arbitrary sums.
            </p>
          </div>

          {metrics.currencyBreakdown && Object.keys(metrics.currencyBreakdown).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(metrics.currencyBreakdown).map(([code, cData]) => (
                <div key={code} className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 text-xs px-2 py-0.5 rounded bg-white border border-slate-300">
                      {code}
                    </span>
                    <span className="text-xs text-slate-500 font-medium font-mono">
                      {cData.count} filing{cData.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/50">
                    <span className="text-slate-500">Total Revenue:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {cData.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {code}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Reported Profit:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {cData.reportedProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {code}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs">
              No financial records ingested yet.
            </div>
          )}

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-amber-800 leading-relaxed">
            <span className="font-bold">Financial Rule E: </span>
            Reconciliation checks are evaluated within the record's native currency. No exchange rates are synthesized.
          </div>
        </div>
      </div>
    </div>
  );
}
