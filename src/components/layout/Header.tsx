import React from 'react';
import {
  Download,
  UploadCloud,
  RefreshCw,
  Database,
  Server,
  FileSpreadsheet,
} from 'lucide-react';
import { ActiveTab, DatasetMetrics } from '../../types/financial';

interface HeaderProps {
  activeTab: ActiveTab;
  metrics: DatasetMetrics;
  onRefreshData: () => void;
  onNavigateToUpload: () => void;
  isPythonOnline?: boolean;
}

export function Header({
  activeTab,
  metrics,
  onRefreshData,
  onNavigateToUpload,
  isPythonOnline = true,
}: HeaderProps) {
  const getTabTitle = (tab: ActiveTab) => {
    switch (tab) {
      case 'dashboard':
      case 'overview':
        return {
          title: 'Financial Data Quality Dashboard',
          subtitle: 'Executive monitoring of dataset integrity, record pass rates, and sector reconciliations.',
        };
      case 'upload':
        return {
          title: 'CSV Data Ingestion & Ingestion Pipeline',
          subtitle: 'Upload financial statement filings with schema validation, Pandas normalization, and transactional SQLite storage.',
        };
      case 'records':
      case 'data-explorer':
        return {
          title: 'Financial Records Ledger',
          subtitle: 'Authoritative financial records persisted in SQLite with native currency preservation and search filters.',
        };
      case 'findings':
      case 'data-quality':
      case 'root-cause':
        return {
          title: 'Deterministic Validation Findings',
          subtitle: 'Evidence-based findings distinguishing confirmed arithmetic errors from statistical distribution warnings.',
        };
      case 'audit':
      case 'audit-trail':
        return {
          title: 'Persistent Audit History & Lineage',
          subtitle: 'Tracked ingestion runs and immutable audit events recorded transactionally in SQLite.',
        };
      default:
        return {
          title: 'FinGuard Data Quality Platform',
          subtitle: 'Financial data ingestion, deterministic validation, and audit tracking.',
        };
    }
  };

  const { title, subtitle } = getTabTitle(activeTab);

  const downloadSampleCSV = () => {
    const link = document.createElement('a');
    link.href = '/sample_financial_data.csv';
    link.download = 'sample_financial_data.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const normalizedTabName = (tab: string) => {
    if (tab === 'overview' || tab === 'dashboard') return 'Dashboard';
    if (tab === 'upload') return 'Upload Data';
    if (tab === 'records' || tab === 'data-explorer') return 'Financial Records';
    if (tab === 'findings' || tab === 'data-quality' || tab === 'root-cause') return 'Validation Findings';
    if (tab === 'audit' || tab === 'audit-trail') return 'Audit History';
    return tab;
  };

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
          <span>FinGuard Platform</span>
          <span>/</span>
          <span className="text-teal-700 font-semibold">
            {normalizedTabName(activeTab)}
          </span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">{title}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      {/* Action Buttons Toolbar */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Backend Status Indicator */}
        <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700">
          <span className={`w-2 h-2 rounded-full ${isPythonOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          <span>FastAPI + SQLite: {isPythonOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Download Sample CSV */}
        <button
          type="button"
          onClick={downloadSampleCSV}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition shadow-2xs"
          title="Download the canonical sample CSV with intentional test cases"
        >
          <Download className="w-3.5 h-3.5 text-slate-500" />
          <span>Sample CSV</span>
        </button>

        {/* Upload Button */}
        {activeTab !== 'upload' && (
          <button
            type="button"
            onClick={onNavigateToUpload}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-2xs transition"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload CSV</span>
          </button>
        )}

        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefreshData}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          title="Refresh metrics and records from SQLite"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
}
