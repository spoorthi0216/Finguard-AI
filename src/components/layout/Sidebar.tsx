import React from 'react';
import {
  LayoutDashboard,
  UploadCloud,
  TableProperties,
  ShieldAlert,
  History,
  FileCode,
  GraduationCap,
  ChevronRight,
  ShieldCheck,
  Database,
} from 'lucide-react';
import { ActiveTab, DatasetMetrics } from '../../types/financial';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  metrics: DatasetMetrics;
  onOpenTechSpec: () => void;
}

export function Sidebar({ activeTab, onTabChange, metrics, onOpenTechSpec }: SidebarProps) {
  const isDashboardActive = activeTab === 'dashboard' || activeTab === 'overview';
  const isUploadActive = activeTab === 'upload';
  const isRecordsActive = activeTab === 'records' || activeTab === 'data-explorer';
  const isFindingsActive = activeTab === 'findings' || activeTab === 'data-quality' || activeTab === 'root-cause';
  const isAuditActive = activeTab === 'audit' || activeTab === 'audit-trail';

  const navItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      isActive: isDashboardActive,
      badge: metrics.recordPassRate !== null && metrics.recordPassRate !== undefined ? `${metrics.recordPassRate.toFixed(1)}%` : null,
      badgeColor: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
    },
    {
      id: 'upload' as ActiveTab,
      label: 'Upload Data',
      icon: UploadCloud,
      isActive: isUploadActive,
      badge: 'CSV',
      badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    },
    {
      id: 'records' as ActiveTab,
      label: 'Financial Records',
      icon: TableProperties,
      isActive: isRecordsActive,
      badge: metrics.totalRecords > 0 ? `${metrics.totalRecords}` : null,
      badgeColor: 'bg-slate-700 text-slate-300',
    },
    {
      id: 'findings' as ActiveTab,
      label: 'Validation Findings',
      icon: ShieldAlert,
      isActive: isFindingsActive,
      badge: metrics.flaggedRecords > 0 ? `${metrics.flaggedRecords}` : null,
      badgeColor: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
    },
    {
      id: 'audit' as ActiveTab,
      label: 'Audit History',
      icon: History,
      isActive: isAuditActive,
      badge: null,
      badgeColor: '',
    },
  ];

  return (
    <aside className="w-64 bg-[#0B132B] text-slate-300 flex flex-col h-screen border-r border-[#1C2541] select-none flex-shrink-0">
      {/* Brand & Logo Header */}
      <div className="p-5 border-b border-[#1C2541]">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/20 ring-1 ring-white/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-white tracking-tight text-base font-sans">
                FinGuard
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800/60 font-semibold">
                CORE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Financial Data Quality Platform</p>
          </div>
        </div>

        {/* Database Status Pill */}
        <div className="mt-4 p-2 rounded-lg bg-[#111C3D] border border-[#1E2C58] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] text-slate-300 font-medium">SQLite Engine</span>
          </div>
          <span className="font-mono text-[11px] text-teal-400 font-semibold">
            {metrics.recordPassRate !== null && metrics.recordPassRate !== undefined ? `${metrics.recordPassRate.toFixed(1)}% Pass` : 'No Data'}
          </span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
          Core Modules
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                item.isActive
                  ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-[#1C2541]/50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    item.isActive ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <span className="tracking-tight">{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Candidate Portfolio & Architecture Specs Card */}
      <div className="p-3 border-t border-[#1C2541] bg-[#090F24]">
        <div className="p-3 rounded-lg bg-[#111A3A] border border-[#1D2A54] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <GraduationCap className="w-4 h-4 text-teal-400" />
              <span className="text-[11px] font-semibold text-white">Data Engineering</span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-300 border border-teal-400/20 font-bold">
              PORTFOLIO
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            FastAPI + Pandas Ingestion, SQL Validation Rules & SQLite Lineage.
          </p>
          <button
            onClick={onOpenTechSpec}
            className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-md bg-teal-500 hover:bg-teal-400 text-[#0B132B] font-semibold text-xs transition-colors shadow-sm cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Architecture & SQL Specs</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-400 px-1 font-mono">
          <span>Production Build</span>
          <span>v2.0</span>
        </div>
      </div>
    </aside>
  );
}
