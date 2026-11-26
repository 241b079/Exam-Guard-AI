'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/shared/Loading';
import { EmptyState } from '@/components/shared/EmptyState';
import { StudentCompletedResultItem, attemptService, StudentAppealModal } from '@/features/attempts';
import {
  History,
  Award,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';

export default function StudentExamHistoryPage() {
  const [results, setResults] = useState<StudentCompletedResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'PENDING' | 'DISQUALIFIED'>('ALL');

  // Appeal Modal State
  const [selectedAttemptForAppeal, setSelectedAttemptForAppeal] = useState<StudentCompletedResultItem | null>(null);
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);

  const fetchHistory = () => {
    setIsLoading(true);
    attemptService
      .getStudentResults()
      .then((data) => {
        setResults(data);
        setError(null);
      })
      .catch((err) => {
        setError(err?.message || 'Failed to load examination attempt history.');
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleOpenAppeal = (item: StudentCompletedResultItem) => {
    setSelectedAttemptForAppeal(item);
    setIsAppealModalOpen(true);
  };

  const handleAppealSubmitted = () => {
    fetchHistory();
  };

  // Filtered Results
  const filteredResults = results.filter((item) => {
    const matchesSearch = item.exam_title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'DISQUALIFIED') return item.is_disqualified || item.publication_status === 'DISQUALIFIED';
    if (statusFilter === 'PUBLISHED') return item.publication_status === 'PUBLISHED' && !item.is_disqualified;
    if (statusFilter === 'PENDING') return item.publication_status !== 'PUBLISHED' && !item.is_disqualified;
    return true;
  });

  // Summary Metrics
  const totalAttempts = results.length;
  const publishedCount = results.filter((r) => r.publication_status === 'PUBLISHED' && !r.is_disqualified).length;
  const pendingCount = results.filter((r) => r.publication_status !== 'PUBLISHED' && !r.is_disqualified).length;
  const disqualifiedCount = results.filter((r) => r.is_disqualified || r.publication_status === 'DISQUALIFIED').length;

  return (
    <DashboardLayout title="Examination History & Results">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="pb-4 border-b border-[#EBE5DC] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
                <History className="w-5 h-5" />
              </span>
              <h2 className="text-xl md:text-2xl font-bold font-serif text-stone-900">
                Examination Attempt History & Results
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Audit log of all your examination attempts, official score releases, academic integrity status, and appeals.
            </p>
          </div>

          <Link href="/student/exams">
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <FileText className="w-3.5 h-3.5" /> Browse Available Exams
            </Button>
          </Link>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-[#EBE5DC] shadow-warm-sm space-y-1">
            <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Total Attempts</span>
            <div className="text-2xl font-serif font-bold text-stone-900">{totalAttempts}</div>
            <span className="text-[11px] text-stone-500">Completed test submissions</span>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 shadow-warm-sm space-y-1">
            <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Results Released</span>
            <div className="text-2xl font-serif font-bold text-emerald-800">{publishedCount}</div>
            <span className="text-[11px] text-emerald-700">Official marks published</span>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 shadow-warm-sm space-y-1">
            <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Pending Evaluation</span>
            <div className="text-2xl font-serif font-bold text-amber-800">{pendingCount}</div>
            <span className="text-[11px] text-amber-700">Marks withheld for review</span>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200/80 shadow-warm-sm space-y-1">
            <span className="text-[10px] uppercase font-bold text-rose-700 tracking-wider">Disqualified</span>
            <div className="text-2xl font-serif font-bold text-rose-800">{disqualifiedCount}</div>
            <span className="text-[11px] text-rose-700">Academic integrity sanctions</span>
          </div>
        </div>

        {/* Search & Status Filters */}
        <div className="p-4 rounded-2xl bg-white border border-[#EBE5DC] shadow-warm-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by exam title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2 rounded-xl border border-[#EBE5DC] focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/30 focus:border-[#C25E1A] bg-stone-50/50"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-stone-900 text-white shadow-warm-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              All ({totalAttempts})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PUBLISHED')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                statusFilter === 'PUBLISHED'
                  ? 'bg-emerald-700 text-white shadow-warm-sm'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Published ({publishedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PENDING')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-700 text-white shadow-warm-sm'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('DISQUALIFIED')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                statusFilter === 'DISQUALIFIED'
                  ? 'bg-rose-700 text-white shadow-warm-sm'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              Disqualified ({disqualifiedCount})
            </button>
          </div>
        </div>

        {/* Content Section */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm shadow-warm-sm flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={fetchHistory} className="gap-1.5 text-xs">
              <RotateCcw className="w-3.5 h-3.5" /> Retry
            </Button>
          </div>
        )}

        {isLoading ? (
          <Loading message="Loading past examination attempts and verified results..." />
        ) : filteredResults.length === 0 ? (
          <EmptyState
            title={results.length === 0 ? 'No Examination Attempts Recorded' : 'No Attempts Match Your Filter'}
            description={
              results.length === 0
                ? 'You have not completed any examination attempts yet. When you submit an exam, it will appear here.'
                : 'Try adjusting your search query or status filter.'
            }
          />
        ) : (
          <div className="space-y-4">
            {filteredResults.map((item) => {
              const isDisq = item.is_disqualified || item.publication_status === 'DISQUALIFIED';
              const isPub = item.publication_status === 'PUBLISHED' && !isDisq;
              const hasAppeal = item.appeal_status && item.appeal_status !== 'NONE';

              return (
                <div
                  key={item.attempt_id}
                  className={`p-6 rounded-3xl border transition-all shadow-warm bg-white space-y-4 ${
                    isDisq
                      ? 'border-rose-300 ring-1 ring-rose-200'
                      : isPub
                      ? 'border-emerald-200 hover:border-emerald-300'
                      : 'border-[#EBE5DC] hover:border-[#D0C5B5]'
                  }`}
                >
                  {/* Top Bar: Title, Attempt Number, Date & Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EBE5DC]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-base md:text-lg font-bold font-serif text-stone-900">
                          {item.exam_title}
                        </h3>
                        <span className="text-xs font-bold text-stone-600 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200">
                          Attempt #{item.attempt_number}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-stone-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-stone-400" />
                          Submitted:{' '}
                          {item.submitted_at
                            ? new Date(item.submitted_at).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : 'Incomplete'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isDisq ? (
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" /> DISQUALIFIED
                        </span>
                      ) : isPub ? (
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> RESULT PUBLISHED
                        </span>
                      ) : item.publication_status === 'HELD' ? (
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> RESULT HELD
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-stone-100 text-stone-700 border border-stone-200 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> PENDING FACULTY RELEASE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score & Publication Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-stone-50/70 border border-[#EBE5DC]">
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Total Score</span>
                      <div className="text-xl font-bold font-serif text-stone-900">
                        {isDisq ? (
                          <span className="text-rose-700">0 / {item.max_possible_score || '—'}</span>
                        ) : isPub ? (
                          <span className="text-emerald-700">
                            {item.total_score} / {item.max_possible_score}
                          </span>
                        ) : (
                          <span className="text-stone-400 text-sm font-normal italic">Withheld (Pending)</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Percentage</span>
                      <div className="text-xl font-bold font-serif text-stone-900">
                        {isDisq ? (
                          <span className="text-rose-700">0%</span>
                        ) : isPub ? (
                          <span className="text-emerald-700">{item.percentage ?? 0}%</span>
                        ) : (
                          <span className="text-stone-400 text-sm font-normal italic">—</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Evaluation Status</span>
                      <div className="text-sm font-semibold text-stone-800 pt-1">
                        {isDisq ? (
                          <span className="text-rose-700">Grade 0 Sanction Applied</span>
                        ) : isPub ? (
                          <span className="text-emerald-700">Graded & Authorized</span>
                        ) : (
                          <span className="text-amber-700">Under Academic Verification</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Disqualification Reason & Appeal Banner (When Disqualified) */}
                  {isDisq && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-rose-900 text-xs font-bold uppercase tracking-wider">
                          <ShieldAlert className="w-4 h-4 text-rose-600" />
                          Faculty Adjudication & Disqualification Notice
                        </div>
                        {hasAppeal && (
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            Appeal Status: {item.appeal_status}
                          </span>
                        )}
                      </div>

                      <div className="p-3 bg-white/90 rounded-xl border border-rose-200/80 text-xs text-rose-950 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-rose-700 block tracking-wider">
                          Official Reason Recorded by Faculty:
                        </span>
                        <p className="font-medium leading-relaxed">
                          "{item.disqualification_reason || 'Academic integrity policy violation identified by proctoring audit.'}"
                        </p>
                        {item.disqualification_evidence && (
                          <p className="text-[11px] text-stone-600 pt-1 border-t border-rose-100 italic">
                            Evidence Summary: {item.disqualification_evidence}
                          </p>
                        )}
                      </div>

                      {/* Appeal statement if student submitted one */}
                      {item.appeal_reason && (
                        <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-stone-800 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-amber-800 block tracking-wider">
                            Your Submitted Appeal Statement:
                          </span>
                          <p className="italic leading-relaxed">"{item.appeal_reason}"</p>
                          {item.appeal_submitted_at && (
                            <span className="text-[10px] text-stone-500 block">
                              Submitted on: {new Date(item.appeal_submitted_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status explanation when unpublished */}
                  {!isPub && !isDisq && item.student_status_message && (
                    <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                      {item.student_status_message}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {isDisq && item.is_appealable && !hasAppeal && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenAppeal(item)}
                          className="gap-1.5 text-xs text-rose-800 bg-rose-50 border-rose-200 hover:bg-rose-100"
                        >
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> Request Review / Appeal Disqualification
                        </Button>
                      )}

                      {isDisq && item.appeal_status === 'PENDING_REVIEW' && (
                        <span className="text-xs text-amber-800 font-semibold bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">
                          Appeal Submitted — Pending Committee Adjudication
                        </span>
                      )}
                    </div>

                    {isPub || isDisq ? (
                      <Link href={`/student/exams/${item.exam_id}/result?attemptId=${item.attempt_id}`}>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold">
                          View Detailed Score Report <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-xs text-stone-400 italic flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Detailed report available after publication
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Appeal Submission Modal */}
      <StudentAppealModal
        isOpen={isAppealModalOpen}
        onClose={() => setIsAppealModalOpen(false)}
        attempt={selectedAttemptForAppeal}
        onAppealSubmitted={handleAppealSubmitted}
      />
    </DashboardLayout>
  );
}
