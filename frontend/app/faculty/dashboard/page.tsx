'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useExams } from '@/features/exams';
import { fetchApi } from '@/lib/api';
import { attemptService, GradebookEntry } from '@/features/attempts';
import {
  FileText,
  Users,
  Eye,
  BarChart3,
  Plus,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  AlertTriangle,
  UserCheck
} from 'lucide-react';

interface ProctoringIncidentSummary {
  id: string;
  exam_id: string;
  exam_title?: string;
  student_name?: string;
  student_email?: string;
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  review_status: 'PENDING' | 'CONFIRMED' | 'DISMISSED' | 'FALSE_POSITIVE';
  detected_at: string;
  evidence_url?: string;
}

interface StudentSummaryItem {
  id: string;
  user_id: string;
  student_id: string;
  name: string;
  email: string;
  batch?: string;
  department?: string;
  is_active: boolean;
  profile_completed: boolean;
}

interface BatchSummary {
  batch: string;
  student_count: number;
  completed_count: number;
  locked_count: number;
  active_permission_count: number;
}

interface FacultyDashboardStats {
  total_exams: number;
  published_exams: number;
  total_students: number;
  active_students: number;
  total_submissions: number;
  proctoring_total_events: number;
  proctoring_pending_reviews: number;
  proctoring_critical_high: number;
  recent_incidents: ProctoringIncidentSummary[];
  recent_students: StudentSummaryItem[];
  batches: BatchSummary[];
}

export default function FacultyDashboardPage() {
  const { user } = useAuth();
  const { exams } = useExams();
  const [recentResults, setRecentResults] = useState<GradebookEntry[]>([]);
  const [stats, setStats] = useState<FacultyDashboardStats | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    setIsLoadingResults(true);
    attemptService.getFacultyRecentResults(5)
      .then((data) => setRecentResults(data))
      .catch(() => {})
      .finally(() => setIsLoadingResults(false));

    setIsLoadingStats(true);
    fetchApi<FacultyDashboardStats>('/api/v1/faculty/dashboard-stats')
      .then((data) => setStats(data))
      .catch((err) => {
        console.error('Failed to load faculty dashboard stats:', err);
      })
      .finally(() => setIsLoadingStats(false));
  }, []);

  if (!user) return null;

  const totalExamsCount = stats?.total_exams ?? exams.length;
  const publishedExamsCount = stats?.published_exams ?? exams.filter((e) => e.status === 'PUBLISHED').length;
  const totalStudentsCount = stats?.total_students ?? 0;
  const totalSubmissionsCount = stats?.total_submissions ?? recentResults.length;
  const pendingReviewsCount = stats?.proctoring_pending_reviews ?? 0;
  const totalEventsCount = stats?.proctoring_total_events ?? 0;
  const primaryExamId = exams[0]?.id;

  return (
    <DashboardLayout title="Faculty Dashboard">
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="p-6 md:p-8 rounded-3xl bg-white border border-[#EBE5DC] shadow-warm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold font-serif text-stone-900">Welcome, {user.name}</h2>
              <Badge variant="faculty">Faculty</Badge>
            </div>
            <p className="text-sm text-stone-600">
              Logged in as <span className="text-stone-900 font-medium">{user.email}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/faculty/exams" id="faculty-dash-manage-exams-btn">
              <Button variant="secondary" className="gap-2 text-xs">
                <FileText className="w-4 h-4 text-[#C25E1A]" /> Manage Exams ({totalExamsCount})
              </Button>
            </Link>
            <Link href="/faculty/students" id="faculty-dash-students-btn">
              <Button variant="secondary" className="gap-2 text-xs">
                <Users className="w-4 h-4 text-[#1E5D88]" /> Students ({totalStudentsCount})
              </Button>
            </Link>
            <Link href="/faculty/exams/create" id="faculty-dash-create-exam-btn">
              <Button variant="primary" className="gap-2 text-xs">
                <Plus className="w-4 h-4" /> Create Exam
              </Button>
            </Link>
          </div>
        </div>

        {/* Live Executive KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Exams */}
          <div className="p-5 bg-white rounded-2xl border border-[#EBE5DC] shadow-warm-sm flex items-center justify-between transition-all hover:border-[#F6D6C0]">
            <div>
              <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Total Exams</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-serif text-stone-900">{totalExamsCount}</span>
                <span className="text-[11px] text-[#C25E1A] font-semibold bg-[#FBECE0] px-2 py-0.5 rounded-full">
                  {publishedExamsCount} Published
                </span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
              <FileText className="w-5 h-5" />
            </div>
          </div>

          {/* Metric 2: Enrolled Students */}
          <div className="p-5 bg-white rounded-2xl border border-[#EBE5DC] shadow-warm-sm flex items-center justify-between transition-all hover:border-[#CDE1EC]">
            <div>
              <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Active Students</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-serif text-stone-900">{totalStudentsCount}</span>
                <span className="text-[11px] text-[#1E5D88] font-semibold bg-[#E8F1F5] px-2 py-0.5 rounded-full">
                  5 Cohorts (B1–B5)
                </span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-[#E8F1F5] text-[#1E5D88] border border-[#CDE1EC]">
              <Users className="w-5 h-5" />
            </div>
          </div>

          {/* Metric 3: AI Proctoring Events */}
          <div className="p-5 bg-white rounded-2xl border border-[#EBE5DC] shadow-warm-sm flex items-center justify-between transition-all hover:border-[#E3DCD2]">
            <div>
              <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">AI Proctoring Events</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-serif text-stone-900">{totalEventsCount}</span>
                <span className="text-[11px] text-rose-700 font-semibold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  {pendingReviewsCount} Pending
                </span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-[#FAF7F2] text-[#C25E1A] border border-[#E3DCD2]">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>

          {/* Metric 4: Graded Submissions */}
          <div className="p-5 bg-white rounded-2xl border border-[#EBE5DC] shadow-warm-sm flex items-center justify-between transition-all hover:border-[#BCF0DA]">
            <div>
              <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Submissions Evaluated</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-serif text-stone-900">{totalSubmissionsCount}</span>
                <span className="text-[11px] text-emerald-800 font-semibold bg-[#DEF7EC] px-2 py-0.5 rounded-full">
                  Live Sync
                </span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Dashboard Core Operations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: My Exams */}
          <Card className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold font-serif text-stone-900">My Exams</h3>
                </div>
                <span className="text-[11px] text-stone-500 font-medium">{exams.length} Total</span>
              </div>

              {exams.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs text-stone-500 italic">No exams created yet.</p>
                  <Link href="/faculty/exams/create">
                    <Button variant="outline" size="sm" className="text-xs">
                      + Create First Exam
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {exams.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className="p-2.5 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] flex justify-between items-center text-xs hover:border-[#F6D6C0] transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <h4 className="font-bold font-serif text-stone-900 truncate">{e.title}</h4>
                        <span className="text-[10px] text-stone-500">
                          {e.status} • {e.question_count} Qs
                        </span>
                      </div>
                      <Link href={`/faculty/exams/${e.id}`}>
                        <Button variant="secondary" size="sm" className="text-[10px] py-1 px-2.5 shrink-0">
                          Manage
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/faculty/exams"
              className="text-xs text-[#C25E1A] hover:text-[#A94F13] font-semibold inline-flex items-center gap-1 pt-2 border-t border-[#EBE5DC]"
            >
              View All Exams ({exams.length}) <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Card>

          {/* Card 2: Active Students & Roster */}
          <Card className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#E8F1F5] text-[#1E5D88] border border-[#CDE1EC]">
                    <Users className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold font-serif text-stone-900">Active Students</h3>
                </div>
                <span className="text-[11px] text-[#1E5D88] font-semibold bg-[#E8F1F5] px-2 py-0.5 rounded-full">
                  {totalStudentsCount} Enrolled
                </span>
              </div>

              {isLoadingStats ? (
                <p className="text-xs text-stone-500 italic py-4">Loading student roster...</p>
              ) : !stats?.recent_students || stats.recent_students.length === 0 ? (
                <div className="py-6 text-center space-y-2">
                  <p className="text-xs text-stone-500 italic">No students registered yet.</p>
                  <Link href="/faculty/students">
                    <Button variant="outline" size="sm" className="text-xs">
                      + Add / Import Students
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {stats.recent_students.slice(0, 3).map((st) => (
                    <div
                      key={st.id}
                      className="p-2.5 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] flex justify-between items-center text-xs hover:border-[#CDE1EC] transition-colors"
                    >
                      <div className="min-w-0 pr-2 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-stone-900 truncate">{st.name}</h4>
                          {st.profile_completed ? (
                            <span className="text-[9px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-semibold">
                              Verified
                            </span>
                          ) : (
                            <span className="text-[9px] text-stone-500 bg-stone-100 px-1 rounded">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-stone-500 truncate">
                          ID: <span className="font-mono text-stone-700">{st.student_id}</span>
                          {st.department ? ` • ${st.department}` : ''}
                        </p>
                      </div>
                      <Link href="/faculty/students">
                        <Button variant="outline" size="sm" className="text-[10px] py-1 px-2.5 shrink-0">
                          View
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#EBE5DC] flex items-center justify-between text-xs">
              <Link
                href="/faculty/students"
                className="text-[#1E5D88] hover:text-[#144262] font-semibold inline-flex items-center gap-1"
              >
                Student Directory <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/faculty/batches"
                className="text-stone-500 hover:text-stone-900 font-medium inline-flex items-center gap-1 text-[11px]"
              >
                Batches & Permissions
              </Link>
            </div>
          </Card>

          {/* Card 3: AI Proctoring & Live Incidents */}
          <Card className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#FAF7F2] text-[#C25E1A] border border-[#E3DCD2]">
                    <Eye className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold font-serif text-stone-900">AI Proctoring</h3>
                </div>
                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Active
                </span>
              </div>

              {/* Status Header */}
              <div className="p-2.5 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between text-amber-900 font-semibold text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> Incident Review Hub
                  </span>
                  <span className="text-amber-800 font-bold">{pendingReviewsCount} Pending</span>
                </div>
                <p className="text-[10px] text-amber-800">
                  Dual-stream WebRTC & continuous face verification are monitoring candidate exam sessions.
                </p>
              </div>

              {isLoadingStats ? (
                <p className="text-xs text-stone-500 italic py-2">Loading incident feeds...</p>
              ) : !stats?.recent_incidents || stats.recent_incidents.length === 0 ? (
                <p className="text-xs text-stone-500 italic py-2">No suspicious proctoring alerts recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.recent_incidents.slice(0, 3).map((inc) => (
                    <div
                      key={inc.id}
                      className="p-2 bg-[#FAF7F2] rounded-xl border border-[#EBE5DC] text-[11px] flex justify-between items-center"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              inc.severity === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800'
                                : inc.severity === 'HIGH'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {inc.event_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-[10px] text-stone-600 truncate mt-0.5">
                          {inc.student_name} • <span className="font-medium text-stone-800">{inc.exam_title}</span>
                        </p>
                      </div>
                      <Link href={primaryExamId ? `/faculty/exams/${inc.exam_id || primaryExamId}#live-feed` : '/faculty/exams'}>
                        <Button variant="ghost" size="sm" className="text-[10px] py-0.5 px-2 text-[#C25E1A]">
                          Review
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Link
              href={primaryExamId ? `/faculty/exams/${primaryExamId}#live-feed` : '/faculty/exams'}
              className="text-xs text-[#C25E1A] hover:text-[#A94F13] font-semibold inline-flex items-center gap-1 pt-2 border-t border-[#EBE5DC]"
            >
              Live Monitor & Evidence ({totalEventsCount}) <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Card>

          {/* Card 4: Results & Gradebook */}
          <Card className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold font-serif text-stone-900">Grading & Results</h3>
                </div>
                <span className="text-[11px] text-stone-500 font-medium">{recentResults.length} Recent</span>
              </div>

              {isLoadingResults ? (
                <p className="text-xs text-stone-500 italic py-4">Loading student submissions...</p>
              ) : recentResults.length === 0 ? (
                <div className="py-6 text-center space-y-1">
                  <p className="text-xs text-stone-500 italic">No student submissions recorded yet.</p>
                  <p className="text-[10px] text-stone-400">Completed student attempts will populate here automatically.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentResults.slice(0, 3).map((entry) => (
                    <div
                      key={entry.attempt_id}
                      className="p-2.5 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] flex justify-between items-center text-xs hover:border-[#BCF0DA] transition-colors"
                    >
                      <div className="space-y-0.5 max-w-[140px]">
                        <h4 className="font-bold text-stone-900 truncate">{entry.student.name}</h4>
                        <p className="text-[10px] text-stone-500 truncate">{entry.exam_title}</p>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="font-semibold text-stone-800">
                            {entry.total_score} / {entry.max_possible_score}
                          </span>
                          <span>•</span>
                          <span
                            className={
                              entry.evaluation_status === 'EVALUATED'
                                ? 'text-emerald-700 font-semibold'
                                : 'text-amber-700'
                            }
                          >
                            {entry.evaluation_status === 'EVALUATED' ? 'Graded' : 'Needs Review'}
                          </span>
                        </div>
                      </div>
                      <Link href={`/faculty/exams/${entry.exam_id}`}>
                        <Button variant="outline" size="sm" className="text-[10px] py-1 px-2.5 shrink-0">
                          Gradebook
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <span className="text-[11px] text-stone-400 block pt-2 border-t border-[#EBE5DC]">
              Showing {recentResults.length} recent submission{recentResults.length !== 1 ? 's' : ''}
            </span>
          </Card>
        </div>

        {/* Academic Cohort Batches Overview Strip */}
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#EBE5DC] gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold font-serif text-stone-900">Academic Batches & Cohorts</h3>
                <p className="text-xs text-stone-500">Student cohorts, verification states, and active edit permissions</p>
              </div>
            </div>
            <Link href="/faculty/batches">
              <Button variant="outline" size="sm" className="text-xs gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C25E1A]" /> Manage Batches & Permissions
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {(stats?.batches && stats.batches.length > 0
              ? stats.batches
              : ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
                  batch: b,
                  student_count: 0,
                  completed_count: 0,
                  locked_count: 0,
                  active_permission_count: 0,
                }))
            ).map((b) => (
              <div
                key={b.batch}
                className="p-3.5 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] flex flex-col justify-between hover:border-[#F6D6C0] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-stone-900 font-serif">Cohort {b.batch}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-[#EBE5DC] text-stone-600">
                    {b.student_count} Students
                  </span>
                </div>
                <div className="mt-3 pt-2 border-t border-[#EBE5DC] flex items-center justify-between text-[10px] text-stone-500">
                  <span>{b.completed_count} Verified</span>
                  {b.active_permission_count > 0 ? (
                    <span className="text-amber-700 font-semibold">{b.active_permission_count} Perms</span>
                  ) : (
                    <span className="text-stone-400">Locked</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Profile Card */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
            <h3 className="text-base font-bold font-serif text-stone-900">
              Profile Information
            </h3>
            <Link href="/faculty/profile">
              <Button variant="ghost" size="sm" className="text-xs text-[#C25E1A]">
                Edit Profile
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">Name</span>
              <p className="text-stone-900 font-medium">{user.name}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">Email</span>
              <p className="text-stone-900 font-medium">{user.email}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">Role</span>
              <p><Badge variant="faculty">{user.role}</Badge></p>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">Account Created</span>
              <p className="text-stone-900 font-medium">{new Date(user.created_at || Date.now()).toLocaleDateString()}</p>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
