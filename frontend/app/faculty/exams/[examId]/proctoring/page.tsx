'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Radio,
  Search,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Users,
  ShieldAlert,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/shared/Loading';
import {
  LiveExamProctoring,
  LiveCandidate,
  proctoringService,
  LiveCandidateGrid,
  ProctoringTimelineModal,
} from '@/features/proctoring';

export default function FacultyExamProctoringRoomPage() {
  const params = useParams();
  const examId = params.examId as string;

  const [proctoringData, setProctoringData] = useState<LiveExamProctoring | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');

  const [selectedCandidate, setSelectedCandidate] = useState<LiveCandidate | null>(null);
  const [isTimelineOpen, setIsTimelineOpen] = useState<boolean>(false);

  const fetchLiveFeed = async (showLoading: boolean = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const data = await proctoringService.getLiveExamFeed(examId);
      setProctoringData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to live proctoring feed');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (examId) {
      fetchLiveFeed(true);
      const interval = setInterval(() => fetchLiveFeed(false), 4000); // 4s auto poll
      return () => clearInterval(interval);
    }
  }, [examId]);

  const handleViewTimeline = (candidate: LiveCandidate) => {
    setSelectedCandidate(candidate);
    setIsTimelineOpen(true);
  };

  const handleTerminateAttempt = async (candidate: LiveCandidate) => {
    const reason = prompt(
      `Are you sure you want to terminate "${candidate.student_name}"? Enter termination reason:`,
      'Security infraction detected by proctor'
    );
    if (reason !== null) {
      try {
        await proctoringService.terminateAttempt(candidate.attempt_id, reason);
        await fetchLiveFeed(false);
      } catch (err: any) {
        alert(err.message || 'Failed to terminate attempt');
      }
    }
  };

  if (isLoading && !proctoringData) {
    return (
      <DashboardLayout title="Live Proctoring Room">
        <Loading message="Connecting to candidate video streams & telemetry..." />
      </DashboardLayout>
    );
  }

  const allCandidates = proctoringData?.candidates || [];

  const filteredCandidates = allCandidates.filter((c) => {
    const matchesSearch =
      c.student_name.toLowerCase().includes(search.toLowerCase()) ||
      c.student_email.toLowerCase().includes(search.toLowerCase()) ||
      (c.student_roll_no && c.student_roll_no.toLowerCase().includes(search.toLowerCase()));

    const matchesRisk = riskFilter === 'ALL' || c.risk_level === riskFilter;

    return matchesSearch && matchesRisk;
  });

  const avgTrustScore =
    allCandidates.length > 0
      ? Math.round(allCandidates.reduce((acc, curr) => acc + curr.trust_score, 0) / allCandidates.length)
      : 100;

  return (
    <DashboardLayout title={`Live Proctoring: ${proctoringData?.exam_title || 'Exam'}`}>
      <div className="space-y-6">
        <Link
          href="/faculty/proctoring"
          className="inline-flex items-center gap-2 text-xs text-stone-500 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Proctoring Hub
        </Link>

        {/* Live Control Room Header */}
        <div className="p-6 md:p-8 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600"></span>
                </span>
                <h1 className="text-2xl font-bold font-serif text-stone-900">
                  {proctoringData?.exam_title}
                </h1>
                <Badge variant={proctoringData?.enable_proctoring ? 'info' : 'faculty'}>
                  {proctoringData?.enable_proctoring ? 'PROCTORED' : 'STANDARD'}
                </Badge>
              </div>
              <p className="text-xs text-stone-500">
                Live monitoring room • Auto-polling every 4 seconds
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchLiveFeed(true)} className="gap-1.5 text-xs">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Feeds
              </Button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#EBE5DC]">
            <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC]">
              <span className="text-[11px] text-stone-500 uppercase font-semibold block">Active Candidates</span>
              <strong className="text-lg font-bold text-emerald-700">{proctoringData?.active_candidates_count || 0}</strong>
            </div>

            <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC]">
              <span className="text-[11px] text-stone-500 uppercase font-semibold block">Flagged / High Risk</span>
              <strong className={`text-lg font-bold ${(proctoringData?.flagged_candidates_count || 0) > 0 ? 'text-rose-600' : 'text-stone-700'}`}>
                {proctoringData?.flagged_candidates_count || 0}
              </strong>
            </div>

            <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC]">
              <span className="text-[11px] text-stone-500 uppercase font-semibold block">Avg Trust Score</span>
              <strong className="text-lg font-bold text-stone-900">{avgTrustScore}%</strong>
            </div>

            <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC]">
              <span className="text-[11px] text-stone-500 uppercase font-semibold block">Total Enrolled</span>
              <strong className="text-lg font-bold text-stone-900">{proctoringData?.total_candidates || 0}</strong>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-4 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search candidate by name, email, roll number..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-[#E2DAD0] rounded-xl text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/20 focus:border-[#C25E1A]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="px-3.5 py-2 bg-white border border-[#E2DAD0] rounded-xl text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/20 focus:border-[#C25E1A] w-full sm:w-auto"
            >
              <option value="ALL">All Risk Levels</option>
              <option value="HIGH">High Risk Only</option>
              <option value="MEDIUM">Medium Risk Only</option>
              <option value="LOW">Low Risk Only</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {error}
          </div>
        )}

        {/* Live Candidate Feeds */}
        <LiveCandidateGrid
          candidates={filteredCandidates}
          onViewTimeline={handleViewTimeline}
          onTerminate={handleTerminateAttempt}
        />
      </div>

      {/* Timeline Inspector Modal */}
      <ProctoringTimelineModal
        isOpen={isTimelineOpen}
        onClose={() => setIsTimelineOpen(false)}
        candidate={selectedCandidate}
      />
    </DashboardLayout>
  );
}
