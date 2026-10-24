import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  ArrowUpDown,
  Building2,
  DollarSign,
  Percent,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { FinancialRecord, Sector } from '../../types/financial';
import { RatingBadge, SyntheticDataBanner } from '../common/Badge';
import { formatFinancialAmount } from '../../utils/formatters';

interface DataExplorerTabProps {
  records: FinancialRecord[];
  onSelectRecordForInvestigation?: (record: FinancialRecord) => void;
  onExportCsv?: () => void;
  selectedRecord?: FinancialRecord | null;
  onSelectRecord?: (record: FinancialRecord | null) => void;
  onOpenRemediationModal?: (record: FinancialRecord) => void;
}

type SortField = 'row' | 'ticker' | 'revenue' | 'expenses' | 'reportedProfit' | 'operatingMargin';
type SortDirection = 'asc' | 'desc';

export function DataExplorerTab({
  records,
  onSelectRecordForInvestigation,
  onExportCsv,
}: DataExplorerTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('row');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Unique periods
  const periods = useMemo(() => {
    return Array.from(new Set(records.map((r) => r.period))).filter(Boolean);
  }, [records]);

  // Filtered & Sorted records
  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => {
        const matchesSearch =
          (r.companyName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
          (r.ticker?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
          (r.companyId?.toLowerCase() || '').includes(searchTerm.toLowerCase());

        const matchesSector = selectedSector === 'ALL' || r.sector === selectedSector;
        const matchesPeriod = selectedPeriod === 'ALL' || r.period === selectedPeriod;
        const matchesStatus =
          selectedStatus === 'ALL'
            ? true
            : selectedStatus === 'VALID'
            ? r.validationStatus === 'VALID'
            : selectedStatus === 'CRITICAL'
            ? r.validationStatus === 'CRITICAL_FAILURE'
            : selectedStatus === 'ANOMALY'
            ? r.validationStatus === 'ANOMALY_INVESTIGATION'
            : selectedStatus === 'FLAGGED'
            ? r.validationStatus !== 'VALID'
            : true;

        return matchesSearch && matchesSector && matchesPeriod && matchesStatus;
      })
      .sort((a, b) => {
        let valA: any = a.rawLineNumber;
        let valB: any = b.rawLineNumber;

        if (sortField === 'ticker') {
          valA = a.ticker;
          valB = b.ticker;
        } else if (sortField === 'revenue') {
          valA = a.revenue ?? -999999;
          valB = b.revenue ?? -999999;
        } else if (sortField === 'expenses') {
          valA = a.expenses ?? -999999;
          valB = b.expenses ?? -999999;
        } else if (sortField === 'reportedProfit') {
          valA = a.reportedProfit ?? -999999;
          valB = b.reportedProfit ?? -999999;
        } else if (sortField === 'operatingMargin') {
          valA = a.operatingMargin ?? -999;
          valB = b.operatingMargin ?? -999;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [records, searchTerm, selectedSector, selectedPeriod, selectedStatus, sortField, sortDirection]);

  // Dynamic summary metrics for filtered cohort
  const cohortMetrics = useMemo(() => {
    const revByCurrency: Record<string, number> = {};
    const profitByCurrency: Record<string, number> = {};
    let marginSum = 0;
    let marginCount = 0;
    let flagCount = 0;

    for (const r of filteredRecords) {
      const c = r.currency ? r.currency.trim().toUpperCase() : 'NO_CURR';
      if (r.revenue !== null) {
        revByCurrency[c] = (revByCurrency[c] || 0) + r.revenue;
      }
      if (r.reportedProfit !== null) {
        profitByCurrency[c] = (profitByCurrency[c] || 0) + r.reportedProfit;
      }
      if (r.operatingMargin !== null) {
        marginSum += r.operatingMargin;
        marginCount++;
      }
      if (r.validationStatus !== 'VALID') flagCount++;
    }

    const formatCurrencyMap = (map: Record<string, number>) => {
      const entries = Object.entries(map);
      if (entries.length === 0) return '0';
      return entries
        .map(([curr, val]) => formatFinancialAmount(Math.round(val), curr === 'NO_CURR' ? null : curr))
        .join(' | ');
    };

    return {
      count: filteredRecords.length,
      formattedRev: formatCurrencyMap(revByCurrency),
      formattedProfit: formatCurrencyMap(profitByCurrency),
      avgMargin: marginCount > 0 ? Math.round((marginSum / marginCount) * 10) / 10 : 0,
      flagCount,
    };
  }, [filteredRecords]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  return (
    <div className="space-y-6">
      <SyntheticDataBanner />

      {/* Cohort Summary Metrics Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            Filtered Cohort
          </span>
          <div className="mt-1 flex items-baseline space-x-1">
            <span className="text-2xl font-bold font-mono text-slate-900">{cohortMetrics.count}</span>
            <span className="text-xs text-slate-400">/ {records.length} total</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            Cohort Total Revenue
          </span>
          <div className="mt-1">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {cohortMetrics.formattedRev}
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            Cohort Reported Profit
          </span>
          <div className="mt-1">
            <span className="text-2xl font-bold font-mono text-teal-600">
              {cohortMetrics.formattedProfit}
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            Mean Operating Margin
          </span>
          <div className="mt-1">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {cohortMetrics.avgMargin}%
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            Cohort Exceptions
          </span>
          <div className="mt-1 flex items-baseline space-x-1.5">
            <span
              className={`text-2xl font-bold font-mono ${
                cohortMetrics.flagCount > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {cohortMetrics.flagCount}
            </span>
            <span className="text-xs text-slate-500">records flagged</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ticker (AAPL, MSFT), company name, or CIK..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Sector Filter */}
          <div className="flex items-center space-x-1">
            <span className="text-slate-500 text-[11px]">Sector:</span>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="ALL">All Sectors</option>
              <option value="Technology">Technology</option>
              <option value="Financials">Financials</option>
              <option value="Healthcare">Healthcare</option>
              <option value="Energy">Energy</option>
              <option value="Consumer">Consumer</option>
              <option value="Industrials">Industrials</option>
            </select>
          </div>

          {/* Period Filter */}
          <div className="flex items-center space-x-1">
            <span className="text-slate-500 text-[11px]">Period:</span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="ALL">All Periods</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1">
            <span className="text-slate-500 text-[11px]">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="VALID">Valid Only</option>
              <option value="FLAGGED">Any Flagged</option>
              <option value="CRITICAL">Critical Failures Only</option>
              <option value="ANOMALY">Unusual Values Only</option>
            </select>
          </div>

          <button
            onClick={onExportCsv}
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer ml-auto"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export View</span>
          </button>
        </div>
      </div>

      {/* Main Financial Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-mono text-[10px] tracking-wider">
                <th
                  onClick={() => handleSort('row')}
                  className="py-3 px-3 font-semibold cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center space-x-1">
                    <span>Row</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ticker')}
                  className="py-3 px-3 font-semibold cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center space-x-1">
                    <span>Company / Ticker</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 font-semibold">CIK / LEI</th>
                <th className="py-3 px-3 font-semibold">Sector</th>
                <th className="py-3 px-3 font-semibold">Period</th>
                <th
                  onClick={() => handleSort('revenue')}
                  className="py-3 px-3 font-semibold cursor-pointer hover:text-slate-900 select-none text-right"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Revenue</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('expenses')}
                  className="py-3 px-3 font-semibold cursor-pointer hover:text-slate-900 select-none text-right"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Expenses</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('reportedProfit')}
                  className="py-3 px-3 font-semibold cursor-pointer hover:text-slate-900 select-none text-right"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Reported Profit</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 font-semibold text-right">Calc Profit</th>
                <th
                  onClick={() => handleSort('operatingMargin')}
                  className="py-3 px-3 font-semibold cursor-pointer hover:text-slate-900 select-none text-right"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Margin %</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 font-semibold text-center">Rating</th>
                <th className="py-3 px-3 font-semibold text-center">Status</th>
                <th className="py-3 px-3 font-semibold text-right">Investigate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-500">
                    No records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const hasDiscrepancy =
                    record.profitDiscrepancy !== null && Math.abs(record.profitDiscrepancy) > 5;
                  const isCritical = record.validationStatus === 'CRITICAL_FAILURE';
                  const isWarning = record.validationStatus === 'ANOMALY_INVESTIGATION';

                  return (
                    <tr
                      key={record.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCritical ? 'bg-rose-50/30' : isWarning ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      {/* Row */}
                      <td className="py-3 px-3 font-mono font-medium text-slate-500">
                        #{record.rawLineNumber}
                      </td>

                      {/* Company Name & Ticker */}
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-2">
                          {record.ticker ? (
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                              {record.ticker}
                            </span>
                          ) : null}
                          <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                            {record.companyName || <span className="text-slate-400 font-normal italic">Missing Name</span>}
                          </span>
                        </div>
                      </td>

                      {/* CIK / Company ID */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                        {record.companyId || <span className="text-rose-500 font-bold">NULL</span>}
                      </td>

                      {/* Sector */}
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {record.sector}
                        </span>
                      </td>

                      {/* Period */}
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {record.period}
                      </td>

                      {/* Revenue */}
                      <td className="py-3 px-3 font-mono text-right font-medium">
                        {record.revenue === null ? (
                          <span className="text-rose-600 font-bold bg-rose-50 px-1 rounded">NULL</span>
                        ) : (
                          formatFinancialAmount(record.revenue, record.currency)
                        )}
                      </td>

                      {/* Expenses */}
                      <td className="py-3 px-3 font-mono text-right font-medium">
                        {record.expenses === null ? (
                          <span className="text-rose-600 font-bold bg-rose-50 px-1 rounded">
                            {record.rawExpenses || 'NULL'}
                          </span>
                        ) : record.expenses < 0 ? (
                          <span className="text-rose-600 font-bold bg-rose-50 px-1 rounded">
                            {formatFinancialAmount(record.expenses, record.currency)}
                          </span>
                        ) : (
                          formatFinancialAmount(record.expenses, record.currency)
                        )}
                      </td>

                      {/* Reported Profit */}
                      <td className="py-3 px-3 font-mono text-right font-bold">
                        {record.reportedProfit === null ? (
                          <span className="text-rose-600 bg-rose-50 px-1 rounded">NULL</span>
                        ) : (
                          <span className={hasDiscrepancy ? 'text-rose-600 underline decoration-rose-300' : 'text-slate-900'}>
                            {formatFinancialAmount(record.reportedProfit, record.currency)}
                          </span>
                        )}
                      </td>

                      {/* Calculated Profit */}
                      <td className="py-3 px-3 font-mono text-right text-slate-500">
                        {record.calculatedProfit === null ? (
                          '—'
                        ) : (
                          formatFinancialAmount(record.calculatedProfit, record.currency)
                        )}
                      </td>

                      {/* Operating Margin */}
                      <td className="py-3 px-3 font-mono text-right font-semibold">
                        {record.operatingMargin === null ? (
                          '—'
                        ) : (
                          <span
                            className={
                              record.operatingMargin > 85
                                ? 'text-amber-600 font-bold'
                                : record.operatingMargin < 5
                                ? 'text-rose-600'
                                : 'text-slate-700'
                            }
                          >
                            {record.operatingMargin}%
                          </span>
                        )}
                      </td>

                      {/* Rating */}
                      <td className="py-3 px-3 text-center">
                        <RatingBadge rating={record.creditRating} />
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        {record.validationStatus === 'VALID' ? (
                          <span className="inline-flex items-center text-emerald-600" title="Valid">
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                        ) : record.validationStatus === 'CRITICAL_FAILURE' ? (
                          <span className="inline-flex items-center text-rose-600" title="Critical Failure">
                            <XCircle className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-amber-500" title="Unusual Value">
                            <AlertTriangle className="w-4 h-4" />
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => onSelectRecordForInvestigation && onSelectRecordForInvestigation(record)}
                          className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 hover:border-teal-200 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          <span>Trace</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
