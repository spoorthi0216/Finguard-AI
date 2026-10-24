/**
 * FinGuard AI — Financial Data Quality Platform
 * Enterprise CSV Ingestion, Deterministic SQL Validation, and SQLite Audit Lineage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ActiveTab,
  FinancialRecord,
  ValidationIssue,
  DatasetMetrics,
  AuditLogEntry,
} from './types/financial';
import {
  checkPythonHealth,
  fetchPersistedMetrics,
  fetchPersistedRecords,
  fetchPersistedFindings,
  fetchPersistedAuditTrail,
  fetchPersistedRuns,
  IngestionRunItem,
  transformPythonIngestionResponse,
} from './services/apiService';

import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardTab } from './components/dashboard/DashboardTab';
import { UploadTab } from './components/upload/UploadTab';
import { DataExplorerTab } from './components/explorer/DataExplorerTab';
import { ValidationFindingsTab } from './components/findings/ValidationFindingsTab';
import { AuditHistoryTab } from './components/audit/AuditHistoryTab';
import { TechSpecModal } from './components/common/TechSpecModal';

const INITIAL_METRICS: DatasetMetrics = {
  totalRecords: 0,
  validRecords: 0,
  flaggedRecords: 0,
  confirmedFailures: 0,
  unusualValues: 0,
  dataQualityScore: null,
  dataQualityPercentage: null,
  recordPassRate: null,
  validityMethod: 'PER_RECORD',
  totalRevenue: 0,
  totalReportedProfit: 0,
  totalCalculatedProfit: 0,
  totalDiscrepancy: 0,
  avgOperatingMargin: 0,
  sectorBreakdown: {
    Technology: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
    Financials: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
    Healthcare: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
    Energy: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
    Consumer: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
    Industrials: { count: 0, validCount: 0, flaggedCount: 0, passRate: null, revenue: 0 },
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isTechSpecModalOpen, setIsTechSpecModalOpen] = useState(false);
  const [isPythonOnline, setIsPythonOnline] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Authoritative State synchronized with SQLite backend
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [metrics, setMetrics] = useState<DatasetMetrics>(INITIAL_METRICS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [ingestionRuns, setIngestionRuns] = useState<IngestionRunItem[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<FinancialRecord | null>(null);

  // Synchronize state with authoritative SQLite database
  const refreshBackendData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [healthStatus, metricsData, recordsData, findingsData, auditData, runsData] =
        await Promise.all([
          checkPythonHealth(),
          fetchPersistedMetrics(),
          fetchPersistedRecords(),
          fetchPersistedFindings(),
          fetchPersistedAuditTrail(),
          fetchPersistedRuns(),
        ]);

      setIsPythonOnline(healthStatus.isOnline);

      if (metricsData) {
        setMetrics(metricsData);
      }
      if (recordsData) {
        setRecords(recordsData);
      }
      if (findingsData) {
        setIssues(findingsData);
      }
      if (auditData) {
        setAuditLogs(auditData);
      }
      if (runsData) {
        setIngestionRuns(runsData);
      }
    } catch (err) {
      console.error('[FinGuard] Error fetching authoritative SQLite state:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshBackendData();
    const interval = setInterval(async () => {
      const health = await checkPythonHealth();
      setIsPythonOnline(health.isOnline);
    }, 8000);
    return () => clearInterval(interval);
  }, [refreshBackendData]);

  // Handle successful CSV upload from Upload tab
  const handleUploadSuccess = async (apiResponse: any) => {
    const transformed = transformPythonIngestionResponse(apiResponse);
    setRecords(transformed.records);
    setIssues(transformed.allIssues);
    setMetrics(transformed.metrics);
    // Refresh audit trail & runs from authoritative SQLite backend
    await refreshBackendData();
  };

  const latestRun = ingestionRuns.length > 0 ? ingestionRuns[0] : null;

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-800 antialiased overflow-hidden">
      {/* Persistent Left Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        metrics={metrics}
        onOpenTechSpec={() => setIsTechSpecModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Toolbar */}
        <Header
          activeTab={activeTab}
          metrics={metrics}
          onRefreshData={refreshBackendData}
          onNavigateToUpload={() => setActiveTab('upload')}
          isPythonOnline={isPythonOnline}
        />

        {/* Scrollable Viewport Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-100">
          {isLoading && (
            <div className="mb-4 p-2 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-700 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
              <span>Syncing with SQLite ledger...</span>
            </div>
          )}

          {/* Screen 1: Dashboard */}
          {(activeTab === 'dashboard' || activeTab === 'overview') && (
            <DashboardTab
              metrics={metrics}
              records={records}
              latestRun={latestRun}
              onNavigateToUpload={() => setActiveTab('upload')}
              onNavigateToFindings={() => setActiveTab('findings')}
              onNavigateToRecords={() => setActiveTab('records')}
            />
          )}

          {/* Screen 2: Upload Data */}
          {activeTab === 'upload' && (
            <UploadTab
              onUploadSuccess={handleUploadSuccess}
              onNavigateToFindings={() => setActiveTab('findings')}
              onNavigateToRecords={() => setActiveTab('records')}
            />
          )}

          {/* Screen 3: Financial Records Ledger */}
          {(activeTab === 'records' || activeTab === 'data-explorer') && (
            <DataExplorerTab
              records={records}
              selectedRecord={selectedRecord}
              onSelectRecord={setSelectedRecord}
              onOpenRemediationModal={() => {}}
            />
          )}

          {/* Screen 4: Validation Findings */}
          {(activeTab === 'findings' || activeTab === 'data-quality' || activeTab === 'root-cause') && (
            <ValidationFindingsTab
              issues={issues}
              onSelectRecord={(recId) => {
                const rec = records.find((r) => r.id === recId);
                if (rec) {
                  setSelectedRecord(rec);
                  setActiveTab('records');
                }
              }}
            />
          )}

          {/* Screen 5: Audit History */}
          {(activeTab === 'audit' || activeTab === 'audit-trail') && (
            <AuditHistoryTab
              auditLogs={auditLogs}
              ingestionRuns={ingestionRuns}
              onRefresh={refreshBackendData}
            />
          )}
        </main>
      </div>

      {/* Architecture & SQL Specifications Modal */}
      <TechSpecModal
        isOpen={isTechSpecModalOpen}
        onClose={() => setIsTechSpecModalOpen(false)}
      />
    </div>
  );
}
