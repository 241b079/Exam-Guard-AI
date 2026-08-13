'use client';

import React, { useState } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StudentImportPreviewResponse, StudentImportRow } from '../types';
import { studentService } from '../services/studentService';

interface ImportStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export const ImportStudentsModal: React.FC<ImportStudentsModalProps> = ({
  isOpen,
  onClose,
  onImported,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StudentImportPreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setIsLoading(true);

    try {
      const result = await studentService.previewImport(selectedFile);
      setPreview(result);
    } catch (err: any) {
      setError(err.message || 'Failed to parse student import file');
      setPreview(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommitImport = async () => {
    if (!preview || preview.valid_count === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const validRows = preview.rows.filter((r) => r.is_valid);
      await studentService.commitImport(validRows);
      onImported();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to import students');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="glass-panel w-full max-w-4xl p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150 my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Import Students from CSV / Excel</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Upload Zone */}
        {!preview && (
          <div className="p-8 border-2 border-dashed border-slate-700 hover:border-brand-500/50 rounded-2xl bg-slate-900/60 text-center space-y-4 transition-all">
            <div className="w-12 h-12 rounded-full bg-brand-500/10 text-brand-400 flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-200">Upload CSV or XLSX File</h3>
              <p className="text-xs text-slate-400">Columns: name, email, student_id, phone, department, course, semester, section, date_of_birth, gender, address</p>
            </div>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv, .xlsx"
                className="hidden"
                onChange={handleFileChange}
              />
              <span className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold cursor-pointer transition-all">
                Select CSV / Excel File
              </span>
            </label>
          </div>
        )}

        {/* Preview Table */}
        {preview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-800/60 p-3 rounded-xl border border-slate-700 text-xs">
              <span className="text-slate-300 font-medium">File: <strong>{file?.name}</strong></span>
              <div className="flex gap-4">
                <span className="text-emerald-400 font-semibold">Valid: {preview.valid_count}</span>
                {preview.invalid_count > 0 && (
                  <span className="text-rose-400 font-semibold">Failed: {preview.invalid_count}</span>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Student ID</th>
                    <th className="p-3">Dept</th>
                    <th className="p-3">Semester</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                  {preview.rows.map((row) => (
                    <tr key={row.row_number} className={!row.is_valid ? 'bg-rose-500/10' : ''}>
                      <td className="p-3 font-semibold text-slate-400">{row.row_number}</td>
                      <td className="p-3 font-semibold text-slate-200">{row.name || '(Empty)'}</td>
                      <td className="p-3 text-slate-300">{row.email || '(Empty)'}</td>
                      <td className="p-3 font-mono text-brand-300">{row.student_id || '(Empty)'}</td>
                      <td className="p-3">{row.department || '-'}</td>
                      <td className="p-3">{row.semester || '-'}</td>
                      <td className="p-3">
                        {row.is_valid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                          </span>
                        ) : (
                          <div className="space-y-0.5 text-rose-400 text-[11px]">
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" /> Invalid
                            </span>
                            {row.errors.map((err, i) => (
                              <p key={i} className="text-[10px] text-rose-300">{err}</p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          {preview && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setPreview(null)}>
                Choose Another File
              </Button>
              <Button
                variant="primary"
                onClick={handleCommitImport}
                disabled={preview.valid_count === 0}
                isLoading={isLoading}
              >
                Import {preview.valid_count} Valid Students
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
