import React, { useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  Settings,
  HelpCircle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { ingestCsvToPython } from '../../services/apiService';

interface UploadTabProps {
  onUploadSuccess: (result: any) => void;
  onNavigateToFindings: () => void;
  onNavigateToRecords: () => void;
}

export function UploadTab({
  onUploadSuccess,
  onNavigateToFindings,
  onNavigateToRecords,
}: UploadTabProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [tolerance, setTolerance] = useState<number>(5.0);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv') || file.type.includes('csv') || file.type.includes('text')) {
        setSelectedFile(file);
        setErrorMsg(null);
      } else {
        setErrorMsg('Please select a valid CSV file (.csv).');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMsg('Please select a CSV file to upload.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    setLastResult(null);

    try {
      const csvText = await selectedFile.text();
      const res = await ingestCsvToPython(csvText, tolerance);

      if (res.error) {
        setErrorMsg(typeof res.error === 'string' ? res.error : (res.error as any)?.message || 'Ingestion failed on backend.');
      } else if (res.data) {
        setLastResult(res.data);
        onUploadSuccess(res.data);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to communicate with Python FastAPI backend.');
    } finally {
      setIsUploading(false);
    }
  };

  const downloadSampleCSV = () => {
    const link = document.createElement('a');
    link.href = '/sample_financial_data.csv';
    link.download = 'sample_financial_data.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Title & Description */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Upload Financial Dataset</h2>
        <p className="text-sm text-slate-500 mt-1">
          Ingest financial statement filings for automated Pandas normalization, deterministic SQL validation, and persistent audit logging.
        </p>
      </div>

      {/* Upload Box & Tolerance Config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Drag & Drop Dropzone */}
        <div className="lg:col-span-2 space-y-4">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              dragActive
                ? 'border-teal-500 bg-teal-50/50 scale-[1.01]'
                : selectedFile
                ? 'border-teal-400 bg-teal-50/20'
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
            }`}
          >
            <input
              type="file"
              id="csvFileInput"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className={`p-4 rounded-full ${selectedFile ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                {selectedFile ? <FileSpreadsheet className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
              </div>

              {selectedFile ? (
                <div>
                  <p className="text-sm font-semibold text-slate-900">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {(selectedFile.size / 1024).toFixed(1)} KB — Ready for ingestion
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Drag and drop your financial CSV file here, or{' '}
                    <label
                      htmlFor="csvFileInput"
                      className="text-teal-600 hover:text-teal-700 font-semibold cursor-pointer underline"
                    >
                      browse local files
                    </label>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Accepts standard comma-separated values (.csv) up to 10MB
                  </p>
                </div>
              )}

              {selectedFile && (
                <div className="pt-2">
                  <label
                    htmlFor="csvFileInput"
                    className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer underline mr-4"
                  >
                    Choose different file
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={downloadSampleCSV}
              className="inline-flex items-center space-x-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition shadow-2xs"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Download Synthetic Sample CSV</span>
            </button>

            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className={`inline-flex items-center space-x-2 px-6 py-2.5 text-sm font-semibold text-white rounded-lg transition shadow-md ${
                !selectedFile || isUploading
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-teal-600 hover:bg-teal-700 shadow-teal-600/20'
              }`}
            >
              {isUploading ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>Processing Ingestion Pipeline...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Execute Ingestion & Validation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Validation Config Parameters */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-100">
            <Settings className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-800">Pipeline Parameters</h3>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Profit Reconciliation Tolerance
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                step="0.5"
                min="0"
                value={tolerance}
                onChange={(e) => setTolerance(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
              <span className="text-xs text-slate-500 font-medium">units</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              Absolute allowable variance for equation: <code className="text-slate-600 font-mono">Reported Profit = Revenue - Expenses</code>. Accommodates standard rounding in filings.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2">
            <h4 className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>Ingestion Guardrails</span>
            </h4>
            <ul className="text-[11px] text-slate-500 space-y-1 list-disc list-inside">
              <li>Atomic transaction with automatic rollback</li>
              <li>Preserves existing company master metadata</li>
              <li>Foreign key enforcement active</li>
              <li>Immutable audit log entry created per run</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Error Message Banner */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-800">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-rose-900">Ingestion Error</h4>
            <p className="text-xs text-rose-700 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Success / Result Feedback Banner */}
      {lastResult && (
        <div className="p-5 bg-white border border-emerald-200 rounded-xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Ingestion Pipeline Completed</h4>
                <p className="text-xs text-slate-500">
                  Run ID: <span className="font-mono font-semibold text-slate-700">{lastResult.run_id}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onNavigateToRecords}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                <span>View Records</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              {lastResult.flagged_records > 0 && (
                <button
                  type="button"
                  onClick={onNavigateToFindings}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span>Review {lastResult.flagged_records} Flagged Issues</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Total Filings</p>
              <p className="text-lg font-bold text-slate-900 font-mono">{lastResult.total_records}</p>
            </div>
            <div className="p-3 bg-emerald-50/50 rounded-lg">
              <p className="text-xs text-emerald-700">Valid Records</p>
              <p className="text-lg font-bold text-emerald-700 font-mono">{lastResult.valid_records}</p>
            </div>
            <div className="p-3 bg-amber-50/50 rounded-lg">
              <p className="text-xs text-amber-700">Flagged Records</p>
              <p className="text-lg font-bold text-amber-700 font-mono">{lastResult.flagged_records}</p>
            </div>
            <div className="p-3 bg-teal-50/50 rounded-lg">
              <p className="text-xs text-teal-700">Record Pass Rate</p>
              <p className="text-lg font-bold text-teal-800 font-mono">
                {lastResult.data_quality_percentage !== null ? `${lastResult.data_quality_percentage}%` : 'No data'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Canonical Schema Reference Guide */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
        <h3 className="text-sm font-bold text-slate-800">Canonical CSV Schema Reference</h3>
        <p className="text-xs text-slate-500">
          The pipeline recognizes standard column aliases and normalizes them into the authoritative financial ledger:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/75">
                <th className="py-2 px-3 font-semibold">Canonical Field</th>
                <th className="py-2 px-3 font-semibold">Type</th>
                <th className="py-2 px-3 font-semibold">Requirement</th>
                <th className="py-2 px-3 font-semibold">Example Values</th>
                <th className="py-2 px-3 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">company_id</td>
                <td className="py-2 px-3 text-slate-500">String</td>
                <td className="py-2 px-3 text-rose-600 font-semibold font-sans">Mandatory</td>
                <td className="py-2 px-3">COMP-101, CIK-0000320193</td>
                <td className="py-2 px-3 font-sans text-slate-600">Unique legal entity or regulatory identifier</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">company_name</td>
                <td className="py-2 px-3 text-slate-500">String</td>
                <td className="py-2 px-3 text-rose-600 font-semibold font-sans">Mandatory</td>
                <td className="py-2 px-3">Apex Dynamics Corp</td>
                <td className="py-2 px-3 font-sans text-slate-600">Official business or filing entity name</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">period</td>
                <td className="py-2 px-3 text-slate-500">String</td>
                <td className="py-2 px-3 text-rose-600 font-semibold font-sans">Mandatory</td>
                <td className="py-2 px-3">2025-Q1, 2025-Q2, 2024-FY</td>
                <td className="py-2 px-3 font-sans text-slate-600">Reporting fiscal period format</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">revenue</td>
                <td className="py-2 px-3 text-slate-500">Float</td>
                <td className="py-2 px-3 text-rose-600 font-semibold font-sans">Mandatory</td>
                <td className="py-2 px-3">125000.0</td>
                <td className="py-2 px-3 font-sans text-slate-600">Total gross revenue in native filing units</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">expenses</td>
                <td className="py-2 px-3 text-slate-500">Float</td>
                <td className="py-2 px-3 text-rose-600 font-semibold font-sans">Mandatory</td>
                <td className="py-2 px-3">85000.0</td>
                <td className="py-2 px-3 font-sans text-slate-600">Total operating expenses in native filing units</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">reported_profit</td>
                <td className="py-2 px-3 text-slate-500">Float</td>
                <td className="py-2 px-3 text-rose-600 font-semibold font-sans">Mandatory</td>
                <td className="py-2 px-3">40000.0</td>
                <td className="py-2 px-3 font-sans text-slate-600">Net reported profit (reconciled against Rev - Exp)</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">currency</td>
                <td className="py-2 px-3 text-slate-500">String</td>
                <td className="py-2 px-3 text-rose-600 font-semibold font-sans">Mandatory</td>
                <td className="py-2 px-3">USD, EUR, GBP</td>
                <td className="py-2 px-3 font-sans text-slate-600">ISO currency code for isolated multi-currency handling</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">sector</td>
                <td className="py-2 px-3 text-slate-500">String</td>
                <td className="py-2 px-3 text-slate-400 font-sans">Optional</td>
                <td className="py-2 px-3">Technology, Financials, Healthcare</td>
                <td className="py-2 px-3 font-sans text-slate-600">Industry sector classification</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
