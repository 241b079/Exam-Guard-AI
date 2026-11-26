'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Scale,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  RefreshCw,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/shared/Loading';
import { EmptyState } from '@/components/shared/EmptyState';
import { attemptService, FacultyAppealItem } from '@/features/attempts';

export default function FacultyAppealsPage() {
  const [appeals, setAppeals] = useState<FacultyAppealItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'>('ALL');
  const [examFilter, setExamFilter] = useState<string>('ALL');

  const [notesByAttempt, setNotesByAttempt] = useState<Record<string, string>>({});
  const [processingAttemptId, setProcessingAttemptId] = useState<string | null>(null);

  const fetchAppeals = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await attemptService.getFacultyAppeals();
      setAppeals(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load student appeals.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAppeals();
  }, []);

  const examOptions = useMemo(() => {
    const map = new Map<string, string>();
    appeals.forEach((a) => {
      if (!map.has(a.exam_id)) {
        map.set(a.exam_id, a.exam_title);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [appeals]);

  const totalCount = appeals.length;
  const pendingCount = appeals.filter((a) => a.appeal_status === 'PENDING_REVIEW').length;
  const approvedCount = appeals.filter((a) => a.appeal_status === 'APPROVED').length;
  const rejectedCount = appeals.filter((a) => a.appeal_status === 'REJECTED').length;

  const filteredAppeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appeals.filter((item) => {
      if (statusFilter !== 'ALL' && item.appeal_status !== statusFilter) return false;
      if (examFilter !== 'ALL' && item.exam_id !== examFilter) return false;
      if (!q) return true;
      return (
        item.student.name.toLowerCase().includes(q) ||
        item.student.email.toLowerCase().includes(q) ||
        (item.student.roll_number || '').toLowerCase().includes(q) ||
        item.exam_title.toLowerCase().includes(q) ||
        (item.appeal_reason || '').toLowerCase().includes(q)
      );
    });
  }, [appeals, statusFilter, examFilter, searchQuery]);

  const handleDecideAppeal = async (attemptId: string, decision: 'APPROVED' | 'REJECTED') => {
    const confirmMsg =
      decision === 'APPROVED'
        ? 'Approve this student appeal? This will clear the disqualification and restore the attempt for grading/publication.'
        : 'Reject this student appeal? The disqualification decision will remain final.';
    if (!window.confirm(confirmMsg)) return;

    setProcessingAttemptId(attemptId);
    try {
      const notes = notesByAttempt[attemptId]?.trim() || undefined;
      await attemptService.decideAppeal(attemptId, decision, notes);
      setNotesByAttempt((prev) => {
        const next = { ...prev };
        delete next[attemptId];
        return next;
      });
      await fetchAppeals();
    } catch (err: any) {
      alert(err?.message || 'Failed to record appeal decision.');
    } finally {
      setProcessingAttemptId(null);
    }
  };

  return (
    <DashboardLayout title="Student Appeals & Adjudication">
      <div className="space-y-6">
        {/* Header */}
        <div className="pb-4 border-b border-[#EBE5DC] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
                <Scale className="w-5 h-5" />
              </span>
              <h2 className="text-xl md:text-2xl font-bold font-serif text-stone-900">
                Global Student Appeals
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Review and adjudicate academic integrity appeals across all your examinations, ordered with the most recent appeals first.
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={fetchAppeals} isLoading={isLoading} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Appeals
          </Button>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-[#EBE5DC] shadow-warm-sm space-y-1">
            <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Total Appeals</span>
            <div className="text-2xl font-serif font-bold text-stone-900">{totalCount}</div>
            <span className="text-[11px] text-stone-500">All submitted requests</span>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 shadow-warm-sm space-y-1">
            <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Pending Review</span>
            <div className="text-2xl font-serif font-bold text-amber-800">{pendingCount}</div>
            <span className="text-[11px] text-amber-700">Awaiting faculty decision</span>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 shadow-warm-sm space-y-1">
            <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Approved</span>
            <div className="text-2xl font-serif font-bold text-emerald-800">{approvedCount}</div>
            <span className="text-[11px] text-emerald-700">Disqualification cleared</span>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200/80 shadow-warm-sm space-y-1">
            <span className="text-[10px] uppercase font-bold text-rose-700 tracking-wider">Rejected</span>
            <div className="text-2xl font-serif font-bold text-rose-800">{rejectedCount}</div>
            <span className="text-[11px] text-rose-700">Sanction upheld</span>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 rounded-2xl bg-white border border-[#EBE5DC] shadow-warm-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student, roll no, exam, or appeal message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-2 rounded-xl border border-[#EBE5DC] focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/30 focus:border-[#C25E1A] bg-stone-50/50"
              />
            </div>

            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              className="text-xs px-3 py-2 rounded-xl border border-[#EBE5DC] bg-stone-50/50 text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/30"
            >
              <option value="ALL">All Exams ({examOptions.length})</option>
              {examOptions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-stone-900 text-white shadow-warm-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PENDING_REVIEW')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                statusFilter === 'PENDING_REVIEW'
                  ? 'bg-amber-700 text-white shadow-warm-sm'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('APPROVED')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                statusFilter === 'APPROVED'
                  ? 'bg-emerald-700 text-white shadow-warm-sm'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Approved ({approvedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('REJECTED')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                statusFilter === 'REJECTED'
                  ? 'bg-rose-700 text-white shadow-warm-sm'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              Rejected ({rejectedCount})
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={fetchAppeals} className="text-xs">
              Retry
            </Button>
          </div>
        )}

        {/* Appeals List */}
        {isLoading && appeals.length === 0 ? (
          <Loading message="Loading student appeals..." />
        ) : filteredAppeals.length === 0 ? (
          <EmptyState
            title={appeals.length === 0 ? 'No Student Appeals Submitted' : 'No Appeals Match Your Filters'}
            description={
              appeals.length === 0
                ? 'When students submit an academic integrity appeal on a disqualified attempt, it will appear here.'
                : 'Try adjusting your search query, exam filter, or status filter.'
            }
          />
        ) : (
          <div className="space-y-4">
            {filteredAppeals.map((item) => {
              const isPending = item.appeal_status === 'PENDING_REVIEW';
              const isApproved = item.appeal_status === 'APPROVED';
              const isBusy = processingAttemptId === item.attempt_id;

              return (
                <div
                  key={item.attempt_id}
                  className={`p-6 rounded-3xl border bg-white shadow-warm space-y-4 ${
                    isPending
                      ? 'border-amber-300 ring-1 ring-amber-200/70'
                      : isApproved
                      ? 'border-emerald-200'
                      : 'border-rose-200'
                  }`}
                >
                  {/* Top Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EBE5DC]">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold font-serif text-stone-900">
                          {item.student.name}
                        </h3>
                        {item.student.roll_number && (
                          <span className="text-[11px] font-mono bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md border border-stone-200">
                            {item.student.roll_number}
                          </span>
                        )}
                        <span className="text-xs text-stone-500">{item.student.email}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
                        <span className="flex items-center gap-1 font-medium text-stone-800">
                          <FileText className="w-3.5 h-3.5 text-[#C25E1A]" />
                          {item.exam_title} (Attempt #{item.attempt_number})
                        </span>
                        {item.appeal_submitted_at && (
                          <span className="flex items-center gap-1 text-stone-500">
                            <Clock className="w-3.5 h-3.5 text-stone-400" />
                            Appealed: {new Date(item.appeal_submitted_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isApproved ? 'success' : isPending ? 'warning' : 'danger'}
                        className="text-[11px]"
                      >
                        {isPending ? 'PENDING REVIEW' : item.appeal_status}
                      </Badge>
                      <Link href={`/faculty/exams/${item.exam_id}`}>
                        <Button variant="outline" size="sm" className="text-xs gap-1">
                          Manage Exam <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* Disqualification Context + Student Appeal Statement */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200/80 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> Disqualification Reason
                      </span>
                      <p className="text-xs text-rose-950 font-medium leading-relaxed">
                        {item.disqualification_reason || 'Academic integrity policy violation.'}
                      </p>
                      {item.disqualification_evidence && (
                        <p className="text-[11px] text-stone-600 pt-1 border-t border-rose-200/60 italic">
                          {item.disqualification_evidence}
                        </p>
                      )}
                    </div>

                    <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC] space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                        Candidate Appeal Message
                      </span>
                      <p className="text-xs text-stone-900 leading-relaxed whitespace-pre-wrap">
                        {item.appeal_reason || 'No appeal message provided.'}
                      </p>
                    </div>
                  </div>

                  {item.appeal_resolution_notes && (
                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-700">
                      <span className="font-semibold text-stone-900">Resolution Notes: </span>
                      {item.appeal_resolution_notes}
                    </div>
                  )}

                  {/* Action Controls for Pending Appeals */}
                  {isPending && (
                    <div className="pt-2 border-t border-[#EBE5DC] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <input
                        type="text"
                        value={notesByAttempt[item.attempt_id] || ''}
                        onChange={(e) =>
                          setNotesByAttempt((prev) => ({ ...prev, [item.attempt_id]: e.target.value }))
                        }
                        placeholder="Optional resolution notes for audit log..."
                        className="flex-1 text-xs bg-stone-50/60 border border-[#EBE5DC] rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/30"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDecideAppeal(item.attempt_id, 'REJECTED')}
                          disabled={isBusy}
                          className="text-xs gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {isBusy ? 'Saving...' : 'Reject Appeal'}
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleDecideAppeal(item.attempt_id, 'APPROVED')}
                          disabled={isBusy}
                          className="text-xs gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {isBusy ? 'Saving...' : 'Approve & Clear Disqualification'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
