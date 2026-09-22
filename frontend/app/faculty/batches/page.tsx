'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fetchApi, getImageUrl } from '@/lib/api';
import { StudentProfile, BatchSummary, ProfileEditPermission } from '@/types';
import {
  Users,
  Lock,
  Unlock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
  KeyRound,
  X,
  UserCheck,
  Layers,
  Sparkles,
  Phone,
  FileEdit,
  Trash2
} from 'lucide-react';

const ALLOWED_BATCHES = ['B1', 'B2', 'B3', 'B4', 'B5'];

const EDITABLE_FIELDS = [
  { key: 'name', label: 'Student Name', description: 'Legal student full name' },
  { key: 'batch', label: 'Academic Batch', description: 'Assigned cohort (B1–B5)' },
  { key: 'phone', label: 'Phone Number', description: 'Contact mobile number' },
  { key: 'course', label: 'Course / Degree', description: 'Academic program (e.g. B.Tech CSE)' },
  { key: 'semester', label: 'Semester', description: 'Current academic semester' },
  { key: 'section', label: 'Section', description: 'Class section (e.g. A, B)' },
  { key: 'date_of_birth', label: 'Date of Birth', description: 'Birthdate verification' },
  { key: 'gender', label: 'Gender', description: 'Gender record' },
  { key: 'address', label: 'Address', description: 'Permanent / residential address' },
  { key: 'profile_picture_url', label: 'Profile Photo', description: 'Official verification photo' },
];

export default function FacultyBatchesPage() {
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('B1');
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingSummaries, setLoadingSummaries] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Grant Permission Modal State
  const [selectedStudentForPermission, setSelectedStudentForPermission] = useState<StudentProfile | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>(['phone', 'batch']);
  const [expiryHours, setExpiryHours] = useState<number>(24);
  const [permissionNotes, setPermissionNotes] = useState<string>('');
  const [submittingPermission, setSubmittingPermission] = useState(false);

  // Load Batch Summaries
  const loadSummaries = async () => {
    try {
      setLoadingSummaries(true);
      const data = await fetchApi<BatchSummary[]>('/api/v1/faculty/batches');
      setSummaries(data);
    } catch (err: any) {
      console.error('Failed to load batch summaries:', err);
    } finally {
      setLoadingSummaries(false);
    }
  };

  // Load Students for Selected Batch
  const loadBatchStudents = async (batch: string) => {
    try {
      setLoadingStudents(true);
      const data = await fetchApi<StudentProfile[]>(`/api/v1/faculty/batches/${batch}/students`);
      setStudents(data);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to load batch students.' });
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    loadSummaries();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      loadBatchStudents(selectedBatch);
    }
  }, [selectedBatch]);

  // Grant Permission Handler
  const handleOpenGrantModal = (student: StudentProfile) => {
    setSelectedStudentForPermission(student);
    setSelectedFields(['batch', 'phone']);
    setExpiryHours(24);
    setPermissionNotes('');
    setActionMessage(null);
  };

  const handleToggleField = (fieldKey: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldKey) ? prev.filter((f) => f !== fieldKey) : [...prev, fieldKey]
    );
  };

  const handleSelectAllFields = () => {
    setSelectedFields(EDITABLE_FIELDS.map((f) => f.key));
  };

  const handleClearAllFields = () => {
    setSelectedFields([]);
  };

  const handleSubmitPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForPermission) return;

    if (selectedFields.length === 0) {
      setActionMessage({ type: 'error', text: 'Please select at least one field to permit.' });
      return;
    }

    try {
      setSubmittingPermission(true);
      await fetchApi(`/api/v1/students/${selectedStudentForPermission.id}/permissions`, {
        method: 'POST',
        body: JSON.stringify({
          allowed_fields: selectedFields,
          expires_hours: expiryHours,
          notes: permissionNotes.trim() || null,
        }),
      });

      setActionMessage({
        type: 'success',
        text: `Edit permission granted to ${selectedStudentForPermission.name} for [${selectedFields.join(', ')}].`,
      });
      setSelectedStudentForPermission(null);
      // Refresh students and summaries
      loadBatchStudents(selectedBatch);
      loadSummaries();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to grant permission.' });
    } finally {
      setSubmittingPermission(false);
    }
  };

  // Revoke Permission Handler
  const handleRevokePermission = async (student: StudentProfile) => {
    if (!student.active_permission) return;
    if (!confirm(`Revoke active profile edit permission for ${student.name}?`)) return;

    try {
      await fetchApi(`/api/v1/students/permissions/${student.active_permission.id}`, {
        method: 'DELETE',
      });
      setActionMessage({
        type: 'success',
        text: `Active permission revoked for ${student.name}. Profile is re-locked.`,
      });
      loadBatchStudents(selectedBatch);
      loadSummaries();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to revoke permission.' });
    }
  };

  // Filtered students by search
  const filteredStudents = students.filter((st) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      st.name.toLowerCase().includes(q) ||
      st.email.toLowerCase().includes(q) ||
      st.student_id.toLowerCase().includes(q) ||
      (st.phone && st.phone.includes(q))
    );
  });

  return (
    <DashboardLayout title="Batches & Permissions">
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="p-6 md:p-8 rounded-3xl bg-white border border-[#EBE5DC] shadow-warm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold font-serif text-stone-900">Batch Management & Permissions</h2>
              <Badge variant="faculty">Faculty Portal</Badge>
            </div>
            <p className="text-xs text-stone-500">
              Oversee student cohorts (B1–B5), monitor locked profiles, and grant temporary field-level edit permissions.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-stone-600 bg-[#FAF7F2] p-2.5 rounded-2xl border border-[#EBE5DC]">
            <Lock className="w-4 h-4 text-[#C25E1A]" />
            <span>Completed profiles are locked by default to protect exam integrity</span>
          </div>
        </div>

        {/* Action Alerts */}
        {actionMessage && (
          <div
            className={`p-4 rounded-2xl border text-sm flex items-start justify-between gap-3 shadow-sm animate-in fade-in ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="text-xs font-semibold">{actionMessage.text}</span>
            </div>
            <button onClick={() => setActionMessage(null)} className="text-stone-400 hover:text-stone-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Batch Cards Grid (B1 - B5) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {ALLOWED_BATCHES.map((batch) => {
            const summary = summaries.find((s) => s.batch === batch);
            const isSelected = selectedBatch === batch;
            const studentCount = summary ? summary.student_count : 0;
            const completedCount = summary ? summary.completed_count : 0;
            const activePermCount = summary ? summary.active_permission_count : 0;

            return (
              <button
                key={batch}
                onClick={() => setSelectedBatch(batch)}
                className={`p-5 rounded-3xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? 'bg-white border-[#C25E1A] shadow-warm ring-2 ring-[#C25E1A]/20'
                    : 'bg-[#FAF7F2] border-[#EBE5DC] hover:border-stone-400 hover:bg-white'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-0 right-0 w-12 h-12 bg-[#FBECE0] rounded-bl-3xl flex items-center justify-center text-[#C25E1A]">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-400">Cohort</span>
                    {activePermCount > 0 && (
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold font-serif text-stone-900">Batch {batch}</h3>
                </div>

                <div className="mt-4 pt-3 border-t border-[#EBE5DC] space-y-1 text-xs">
                  <div className="flex justify-between text-stone-600">
                    <span>Enrolled:</span>
                    <strong className="text-stone-900">{studentCount}</strong>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Locked Profiles:</span>
                    <strong className="text-emerald-700">{completedCount}</strong>
                  </div>
                  {activePermCount > 0 && (
                    <div className="flex justify-between text-emerald-800 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-lg border border-emerald-200 mt-1">
                      <span>Unlocked:</span>
                      <span>{activePermCount} active</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Batch Student Roster */}
        <Card className="p-6 md:p-8 bg-white border-[#EBE5DC] shadow-warm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBE5DC]">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold font-serif text-stone-900">
                  Batch {selectedBatch} — Student Roster
                </h3>
                <Badge variant="outline" className="bg-[#FAF7F2] border-[#E3DCD2] text-stone-700">
                  {filteredStudents.length} Students
                </Badge>
              </div>
              <p className="text-xs text-stone-500">
                Review profile status and grant field-specific edit permissions to students in Batch {selectedBatch}.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by name, roll no, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs border bg-white border-[#EBE5DC] focus:border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/20 transition-all text-stone-900"
              />
            </div>
          </div>

          {/* Student Table */}
          {loadingStudents ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-2 border-[#C25E1A] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-stone-500">Loading Batch {selectedBatch} students...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Users className="w-10 h-10 text-stone-300 mx-auto" />
              <p className="text-sm font-semibold text-stone-700">No students found in Batch {selectedBatch}</p>
              <p className="text-xs text-stone-400">
                {searchQuery
                  ? 'No matching students for your search query.'
                  : `Students assigned to Batch ${selectedBatch} upon profile completion will appear here.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#EBE5DC] text-stone-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="pb-3 pl-2">Student</th>
                    <th className="pb-3">Roll Number</th>
                    <th className="pb-3">Contact</th>
                    <th className="pb-3">Course / Sem</th>
                    <th className="pb-3">Profile Status</th>
                    <th className="pb-3 text-right pr-2">Permission Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#FAF7F2]">
                  {filteredStudents.map((st) => {
                    const hasActivePerm = Boolean(st.active_permission);

                    return (
                      <tr key={st.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                        {/* Student Name & Avatar */}
                        <td className="py-3.5 pl-2">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-2xl bg-[#FBECE0] border border-[#F6D6C0] flex items-center justify-center text-[#C25E1A] font-bold text-xs shrink-0 overflow-hidden shadow-warm-sm">
                              {st.profile_picture_url ? (
                                <img
                                  src={getImageUrl(st.profile_picture_url)}
                                  alt={st.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                st.name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-stone-900">{st.name}</p>
                              <p className="text-[11px] text-stone-500">{st.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Roll Number */}
                        <td className="py-3.5 font-mono text-stone-800 font-medium">
                          {st.student_id}
                        </td>

                        {/* Contact */}
                        <td className="py-3.5 text-stone-600">
                          {st.phone ? (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-stone-400" />
                              {st.phone}
                            </span>
                          ) : (
                            <span className="text-stone-400 italic">No phone</span>
                          )}
                        </td>

                        {/* Course & Semester */}
                        <td className="py-3.5 text-stone-600">
                          <div>
                            <span className="font-medium text-stone-800">{st.course || '—'}</span>
                            {st.semester && (
                              <span className="text-[11px] text-stone-400 block">Sem {st.semester}</span>
                            )}
                          </div>
                        </td>

                        {/* Profile Status */}
                        <td className="py-3.5">
                          {hasActivePerm ? (
                            <div className="space-y-1">
                              <Badge variant="success" className="gap-1.5 shadow-sm text-[10px] py-1 px-2.5">
                                <Unlock className="w-3 h-3 animate-pulse" /> Edit Active
                              </Badge>
                              <span className="text-[10px] text-emerald-800 block truncate max-w-[150px]" title={(st.active_permission?.allowed_fields || []).join(', ')}>
                                Allowed: {(st.active_permission?.allowed_fields || []).join(', ')}
                              </span>
                            </div>
                          ) : st.profile_completed ? (
                            <Badge variant="outline" className="gap-1 bg-stone-100 text-stone-700 border-stone-300 text-[10px]">
                              <Lock className="w-3 h-3 text-stone-500" /> Profile Locked
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="gap-1 text-[10px]">
                              <AlertCircle className="w-3 h-3" /> Incomplete
                            </Badge>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 text-right pr-2">
                          <div className="flex items-center justify-end gap-2">
                            {hasActivePerm ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRevokePermission(st)}
                                className="text-[11px] text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200 gap-1 px-2.5 py-1"
                                title="Revoke Active Permission"
                              >
                                <Trash2 className="w-3 h-3" /> Revoke
                              </Button>
                            ) : null}

                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleOpenGrantModal(st)}
                              className="text-[11px] gap-1 px-3 py-1 shadow-warm-sm"
                            >
                              <KeyRound className="w-3 h-3" />
                              {hasActivePerm ? 'Re-grant' : 'Grant Permission'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Grant Permission Modal */}
        {selectedStudentForPermission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 md:p-8 shadow-warm-lg border border-[#EBE5DC] space-y-6 animate-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-start justify-between pb-4 border-b border-[#EBE5DC]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold font-serif text-stone-900">
                      Grant Profile Edit Permission
                    </h3>
                  </div>
                  <p className="text-xs text-stone-500">
                    Student: <strong>{selectedStudentForPermission.name}</strong> ({selectedStudentForPermission.student_id})
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStudentForPermission(null)}
                  className="p-1 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-[#FAF7F2]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmitPermission} className="space-y-5">
                {/* Granular Field Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-stone-800">
                      Select Permitted Profile Fields:
                    </label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={handleSelectAllFields}
                        className="text-[#C25E1A] hover:underline font-semibold"
                      >
                        Select All
                      </button>
                      <span className="text-stone-300">|</span>
                      <button
                        type="button"
                        onClick={handleClearAllFields}
                        className="text-stone-500 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {EDITABLE_FIELDS.map((f) => {
                      const isChecked = selectedFields.includes(f.key);
                      return (
                        <label
                          key={f.key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-2xl border cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-[#FBECE0]/50 border-[#C25E1A] text-stone-900 shadow-sm'
                              : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-600 hover:border-stone-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleField(f.key)}
                            className="mt-0.5 rounded text-[#C25E1A] focus:ring-[#C25E1A]"
                          />
                          <div className="text-xs">
                            <span className="font-bold block">{f.label}</span>
                            <span className="text-[10px] text-stone-500">{f.description}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Expiry Duration */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-800">Permission Expiration Window:</label>
                  <select
                    value={expiryHours}
                    onChange={(e) => setExpiryHours(parseInt(e.target.value, 10))}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs border bg-white border-[#EBE5DC] focus:border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/20 transition-all text-stone-900 font-semibold"
                  >
                    <option value={1}>1 Hour (Quick Edit)</option>
                    <option value={6}>6 Hours</option>
                    <option value={12}>12 Hours</option>
                    <option value={24}>24 Hours (Standard 1 Day)</option>
                    <option value={48}>48 Hours (2 Days)</option>
                    <option value={168}>7 Days (1 Week)</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-800">Reason / Internal Notes (Optional):</label>
                  <input
                    type="text"
                    value={permissionNotes}
                    onChange={(e) => setPermissionNotes(e.target.value)}
                    placeholder="e.g. Student requested batch transfer or phone correction"
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs border bg-white border-[#EBE5DC] focus:border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/20 transition-all text-stone-900"
                  />
                </div>

                {/* Info Box */}
                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    Once the student saves their changes, this permission will be automatically marked as{' '}
                    <strong>USED</strong> and the profile will immediately re-lock.
                  </p>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-[#EBE5DC] flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedStudentForPermission(null)}
                    className="text-xs px-4"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submittingPermission || selectedFields.length === 0}
                    className="text-xs gap-1.5 px-5 shadow-warm-sm"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {submittingPermission ? 'Granting...' : 'Grant Edit Permission'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
