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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-4xl p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm-lg space-y-6 animate-in fade-in zoom-in-95 duration-150 my-8">
        <div className="flex items-center justify-between border-b border-[#EBE5DC] pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold font-serif text-stone-900">Import Students from CSV / Excel</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-[#FAF7F2]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Upload Zone */}
        {!preview && (
          <div className="p-8 border-2 border-dashed border-[#D8CFBF] hover:border-[#C25E1A] rounded-3xl bg-[#FAF7F2] text-center space-y-4 transition-all">
            <div className="w-12 h-12 rounded-full bg-[#FBECE0] text-[#C25E1A] flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-stone-800">Upload CSV or XLSX File</h3>
              <p className="text-xs text-stone-500">Columns: name, email, student_id, phone, department, course, semester, section, date_of_birth, gender, address</p>
            </div>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv, .xlsx"
                className="hidden"
                onChange={handleFileChange}
              />
              <span className="px-5 py-2.5 rounded-xl bg-[#C25E1A] hover:bg-[#A94F13] text-white text-xs font-semibold cursor-pointer transition-all shadow-warm-sm">
                Select CSV / Excel File
              </span>
            </label>
          </div>
        )}

        {/* Preview Table */}
        {preview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[#FAF7F2] p-3 rounded-2xl border border-[#EBE5DC] text-xs">
              <span className="text-stone-700 font-medium">File: <strong className="text-stone-900">{file?.name}</strong></span>
              <div className="flex gap-4">
                <span className="text-emerald-700 font-semibold">Valid: {preview.valid_count}</span>
                {preview.invalid_count > 0 && (
                  <span className="text-rose-600 font-semibold">Failed: {preview.invalid_count}</span>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-2xl border border-[#EBE5DC]">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-[#FAF7F2] text-stone-500 uppercase tracking-wider text-[11px] font-semibold sticky top-0 border-b border-[#EBE5DC]">
                  <tr>
                    <th className="p-3.5">#</th>
                    <th className="p-3.5">Name</th>
                    <th className="p-3.5">Email</th>
                    <th className="p-3.5">Student ID</th>
                    <th className="p-3.5">Dept</th>
                    <th className="p-3.5">Semester</th>
                    <th className="p-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE5DC] bg-white">
                  {preview.rows.map((row) => (
                    <tr key={row.row_number} className={!row.is_valid ? 'bg-rose-50/50' : 'hover:bg-[#FAF7F2]'}>
                      <td className="p-3.5 font-semibold text-stone-500">{row.row_number}</td>
                      <td className="p-3.5 font-semibold text-stone-900">{row.name || '(Empty)'}</td>
                      <td className="p-3.5 text-stone-700">{row.email || '(Empty)'}</td>
                      <td className="p-3.5 font-mono text-[#C25E1A] font-medium">{row.student_id || '(Empty)'}</td>
                      <td className="p-3.5">{row.department || '-'}</td>
                      <td className="p-3.5">{row.semester || '-'}</td>
                      <td className="p-3.5">
                        {row.is_valid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                          </span>
                        ) : (
                          <div className="space-y-0.5 text-rose-600 text-[11px]">
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" /> Invalid
                            </span>
                            {row.errors.map((err, i) => (
                              <p key={i} className="text-[10px] text-rose-500">{err}</p>
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

        <div className="flex items-center justify-between pt-4 border-t border-[#EBE5DC]">
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

