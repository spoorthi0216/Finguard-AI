import React, { useState } from 'react';
import {
  History,
  ShieldCheck,
  RotateCcw,
  Download,
  CheckCircle2,
  Clock,
  User,
  Ticket,
  ArrowRight,
  Database,
  Filter,
  FileSpreadsheet,
} from 'lucide-react';
import { AuditLogEntry, PipelineRun, FinancialRecord } from '../../types/financial';
import { SyntheticDataBanner } from '../common/Badge';

interface AuditTrailTabProps {
  auditLogs: AuditLogEntry[];
  pipelineRuns: PipelineRun[];
  records: FinancialRecord[];
  onRollback: (log: AuditLogEntry) => void;
  onExportAuditLog: () => void;
}

export function AuditTrailTab({
  auditLogs,
  pipelineRuns,
  records,
  onRollback,
  onExportAuditLog,
}: AuditTrailTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'corrections' | 'pipeline-runs'>('corrections');

  return (
    <div className="space-y-6">
      <SyntheticDataBanner />

      {/* Header and Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <div className="flex p-1 rounded-lg bg-slate-100 text-xs font-semibold">
            <button
              onClick={() => setActiveSubTab('corrections')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeSubTab === 'corrections'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Recorded Corrections ({auditLogs.length})
            </button>
            <button
              onClick={() => setActiveSubTab('pipeline-runs')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeSubTab === 'pipeline-runs'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Pipeline Processing Runs ({pipelineRuns.length})
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onExportAuditLog}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Audit Trail (CSV)</span>
          </button>
        </div>
      </div>

      {/* Sub-Tab 1: Recorded Corrections & Value Lineage */}
      {activeSubTab === 'corrections' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center space-x-2">
                <History className="w-4 h-4 text-teal-600" />
                <span>Immutable Remediation Log & Before/After Lineage</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every manual correction preserves the original raw value to meet BCBS 239 / SOX audit standards
              </p>
            </div>
            <span className="text-xs font-mono text-teal-700 bg-teal-50 px-2 py-0.5 rounded font-semibold border border-teal-200">
              Immutable Ledger
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-mono text-[10px] tracking-wider">
                  <th className="py-3 px-4 font-semibold">Timestamp</th>
                  <th className="py-3 px-4 font-semibold">Ticket ID</th>
                  <th className="py-3 px-4 font-semibold">Entity / Ticker</th>
                  <th className="py-3 px-4 font-semibold">Field</th>
                  <th className="py-3 px-4 font-semibold">Original (Before)</th>
                  <th className="py-3 px-4 font-semibold">Corrected (After)</th>
                  <th className="py-3 px-4 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Justification & Context</th>
                  <th className="py-3 px-4 font-semibold text-right">Rollback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700">No manual corrections recorded yet</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Use the "Fix" button in Data Quality or Root-Cause Investigator to remediate an issue.
                      </p>
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>

                      {/* Ticket */}
                      <td className="py-3 px-4 font-mono font-bold text-teal-700">
                        {log.remediationTicket}
                      </td>

                      {/* Entity */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{log.ticker}</div>
                        <div className="font-mono text-[11px] text-slate-500">{log.companyId}</div>
                      </td>

                      {/* Field */}
                      <td className="py-3 px-4 font-mono text-slate-700 font-semibold">
                        {log.field}
                      </td>

                      {/* Before Value */}
                      <td className="py-3 px-4 font-mono">
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                          {log.beforeValue === null ? 'NULL' : String(log.beforeValue)}
                        </span>
                      </td>

                      {/* After Value */}
                      <td className="py-3 px-4 font-mono">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                          {log.afterValue === null ? 'NULL' : String(log.afterValue)}
                        </span>
                      </td>

                      {/* User */}
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                        {log.user}
                      </td>

                      {/* Justification */}
                      <td className="py-3 px-4 text-slate-600 max-w-xs text-[11px] leading-relaxed" title={log.justification}>
                        {log.justification}
                      </td>

                      {/* Rollback Action */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onRollback(log)}
                          title="Restore original value"
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Revert</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Pipeline Processing Runs */}
      {activeSubTab === 'pipeline-runs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center space-x-2">
                <Database className="w-4 h-4 text-teal-600" />
                <span>Financial Ingestion Pipeline Execution Runs</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulated Airflow DAG & dbt Core execution histories across Bronze, Silver, and Gold layers
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-mono text-[10px] tracking-wider">
                  <th className="py-3 px-4 font-semibold">Run ID</th>
                  <th className="py-3 px-4 font-semibold">Pipeline Stage</th>
                  <th className="py-3 px-4 font-semibold">Started At</th>
                  <th className="py-3 px-4 font-semibold">Duration</th>
                  <th className="py-3 px-4 font-semibold">Total Records</th>
                  <th className="py-3 px-4 font-semibold">Valid Passed</th>
                  <th className="py-3 px-4 font-semibold">Exceptions Surfaced</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Engine</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pipelineRuns.map((run) => {
                  const isDemo =
                    run.runId.includes('DEMO') ||
                    run.pipelineStage.includes('Demo') ||
                    run.pipelineStage.includes('Simulated') ||
                    run.engine.includes('Demo');

                  return (
                    <tr key={run.runId} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <div className="flex items-center space-x-2">
                          <span>{run.runId}</span>
                          {isDemo ? (
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              Simulated Demo
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 font-semibold">
                              Live Run
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {run.pipelineStage}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {new Date(run.startedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {run.durationMs}ms
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-800">
                        {run.totalRecords}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-emerald-600 font-semibold">
                        {run.validRecords}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-rose-600 font-semibold">
                        {run.flaggedRecords}
                      </td>
                      <td className="py-3.5 px-4">
                        {run.status === 'SUCCESS' ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            SUCCESS
                          </span>
                        ) : run.status === 'WARNING' ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            WARNING
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            FAILED
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                        {run.engine}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
