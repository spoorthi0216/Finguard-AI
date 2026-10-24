import React, { useState } from 'react';
import {
  History,
  FileSpreadsheet,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  ShieldCheck,
  Server,
  Layers,
} from 'lucide-react';
import { AuditLogEntry } from '../../types/financial';
import { IngestionRunItem } from '../../services/apiService';

interface AuditHistoryTabProps {
  auditLogs: AuditLogEntry[];
  ingestionRuns: IngestionRunItem[];
  onRefresh?: () => void;
}

export function AuditHistoryTab({
  auditLogs,
  ingestionRuns,
  onRefresh,
}: AuditHistoryTabProps) {
  const [activeView, setActiveView] = useState<'runs' | 'events'>('runs');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Title & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Persistent Audit History</h2>
          <p className="text-sm text-slate-500 mt-1">
            Immutable SQLite audit ledger tracking every ingestion attempt, transaction persistence outcome, and validation finding run.
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveView('runs')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              activeView === 'runs'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ingestion Runs ({ingestionRuns.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('events')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              activeView === 'events'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Audit Events ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* View 1: Ingestion Runs */}
      {activeView === 'runs' && (
        <div className="space-y-4">
          {ingestionRuns.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl shadow-2xs">
              <Clock className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-900">No Ingestion Runs Recorded</h3>
              <p className="text-xs text-slate-500 mt-1">
                Upload a financial CSV file to execute the pipeline and generate the first persistent audit run.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-[11px] font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Run ID</th>
                      <th className="py-3 px-4">Source Filename</th>
                      <th className="py-3 px-4">Started (UTC)</th>
                      <th className="py-3 px-4">Rows Processed</th>
                      <th className="py-3 px-4">Accepted Records</th>
                      <th className="py-3 px-4">Findings</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {ingestionRuns.map((run) => {
                      const isSuccess = run.status === 'SUCCESS';
                      const isWarning = run.status === 'SUCCESS_WITH_WARNINGS';
                      const isErrors = run.status === 'COMPLETED_WITH_ERRORS';
                      const isFailed = run.status === 'FAILED';

                      return (
                        <tr key={run.runId} className="hover:bg-slate-50/60 transition">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                            {run.runId}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800 flex items-center space-x-1.5">
                            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                            <span>{run.filename}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                            {run.startedAt ? run.startedAt.replace('T', ' ').slice(0, 19) : 'N/A'}
                          </td>
                          <td className="py-3 px-4 font-mono">{run.totalRows}</td>
                          <td className="py-3 px-4 font-mono text-emerald-700 font-semibold">
                            {run.acceptedRecords}
                          </td>
                          <td className="py-3 px-4 font-mono">
                            {run.findingsCount > 0 ? (
                              <span className="text-rose-600 font-semibold">{run.findingsCount}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isSuccess
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : isWarning
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : isErrors
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-red-200 text-red-900 border border-red-300'
                              }`}
                            >
                              {run.status.replace(/_/g, ' ')}
                            </span>
                            {run.errorSummary && (
                              <p className="text-[10px] text-red-600 mt-0.5 truncate max-w-xs" title={run.errorSummary}>
                                {run.errorSummary}
                              </p>
                            )}
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
      )}

      {/* View 2: Detailed Audit Events Stream */}
      {activeView === 'events' && (
        <div className="space-y-4">
          {auditLogs.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl shadow-2xs">
              <Database className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-900">No Audit Events Logged</h3>
              <p className="text-xs text-slate-500 mt-1">
                Database operations, ingestion runs, and persistence events will appear here in chronological order.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-[11px] font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Timestamp (UTC)</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Run ID</th>
                      <th className="py-3 px-4">Field / Target</th>
                      <th className="py-3 px-4">Outcome / After Value</th>
                      <th className="py-3 px-4">Justification / Audit Trail Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {auditLogs.map((entry) => {
                      const isIngest = entry.action.includes('INGESTION');
                      const isPersist = entry.action.includes('PERSISTENCE');
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/60 transition">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {entry.timestamp ? entry.timestamp.replace('T', ' ').slice(0, 19) : 'N/A'}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isPersist
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : isIngest
                                  ? 'bg-teal-100 text-teal-800 border border-teal-200'
                                  : 'bg-slate-100 text-slate-800 border border-slate-200'
                              }`}
                            >
                              {entry.action}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-800">{entry.runId}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">{entry.field}</td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">
                            {entry.afterValue !== null ? String(entry.afterValue) : '—'}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 max-w-md">
                            {entry.justification}
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
      )}

      {/* Architecture Integrity Note */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center space-x-3 text-xs text-slate-600">
        <Server className="w-5 h-5 text-teal-600 flex-shrink-0" />
        <div>
          <span className="font-bold text-slate-800">Authoritative SQLite Storage: </span>
          All audit runs and events are written transactionally to SQLite (<code className="font-mono text-slate-700">ingestion_runs</code> & <code className="font-mono text-slate-700">audit_events</code>). They persist across server restarts without artificial demo simulations.
        </div>
      </div>
    </div>
  );
}
