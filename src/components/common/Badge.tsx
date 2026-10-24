import React from 'react';
import { ValidationSeverity, IssueType } from '../../types/financial';

export function SeverityBadge({ severity }: { severity: ValidationSeverity }) {
  if (severity === 'CRITICAL') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5"></span>
        CRITICAL
      </span>
    );
  }
  if (severity === 'WARNING') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
        WARNING
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>
      INFO
    </span>
  );
}

export function IssueTypeBadge({ type }: { type: IssueType }) {
  if (type === 'CONFIRMED_FAILURE') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
        Confirmed Failure
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
      Unusual Value (Investigation)
    </span>
  );
}

export function RatingBadge({ rating }: { rating: string }) {
  const getColors = (r: string) => {
    if (r.startsWith('AAA')) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (r.startsWith('AA')) return 'bg-teal-100 text-teal-800 border-teal-300';
    if (r.startsWith('A')) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (r.startsWith('BBB')) return 'bg-indigo-100 text-indigo-800 border-indigo-300';
    if (r.startsWith('BB')) return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-rose-100 text-rose-800 border-rose-300';
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border ${getColors(rating)}`}>
      {rating}
    </span>
  );
}

export function SyntheticDataBanner() {
  return (
    <div className="bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg flex items-center justify-between text-xs text-amber-900">
      <div className="flex items-center space-x-2">
        <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white font-mono font-bold text-[10px] tracking-wide uppercase">
          SYNTHETIC DEMO DATASET
        </span>
        <span className="font-medium">
          SEC 10-Q/10-K Rating Pipeline Simulation. All company metrics engineered for data quality evaluation.
        </span>
      </div>
      <span className="hidden md:inline font-mono text-[11px] text-amber-700 font-semibold">
        Simulated Ingestion Stream • v2.4
      </span>
    </div>
  );
}

export function EngineStatusBanner({
  engine,
  isOnline,
}: {
  engine: 'PYTHON_FASTAPI' | 'TYPESCRIPT_FALLBACK';
  isOnline: boolean;
}) {
  if (engine === 'PYTHON_FASTAPI' && isOnline) {
    return (
      <div className="bg-teal-500/10 border border-teal-500/25 px-3 py-1.5 rounded-lg flex items-center justify-between text-xs text-teal-950">
        <div className="flex items-center space-x-2">
          <span className="px-1.5 py-0.5 rounded bg-teal-600 text-white font-mono font-bold text-[10px] tracking-wide uppercase">
            PYTHON FASTAPI ACTIVE
          </span>
          <span className="font-medium text-teal-900">
            Authoritative Python Pandas validation engine connected. Financial filings & audit lineage persisted in SQLite.
          </span>
        </div>
        <span className="hidden md:inline font-mono text-[11px] text-teal-700 font-semibold">
          SQLite Active • Port 8000
        </span>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-lg flex items-center justify-between text-xs text-amber-950">
      <div className="flex items-center space-x-2">
        <span className="px-1.5 py-0.5 rounded bg-amber-600 text-white font-mono font-bold text-[10px] tracking-wide uppercase">
          TYPESCRIPT CLIENT ENGINE
        </span>
        <span className="font-medium text-amber-900">
          Python FastAPI backend is offline. Operating on client-side TypeScript validation engine.
        </span>
      </div>
      <span className="hidden md:inline font-mono text-[11px] text-amber-700 font-semibold">
        Client In-Memory Mode
      </span>
    </div>
  );
}
