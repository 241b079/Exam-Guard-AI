'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/shared/EmptyState';
import { useExams } from '@/features/exams';
import { BookOpen, CalendarClock, Award, UserCheck, ArrowRight, Clock, Play } from 'lucide-react';
import { StudentActiveExamSummary, attemptService } from '@/features/attempts';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const { exams } = useExams();
  const [activeExam, setActiveExam] = useState<StudentActiveExamSummary | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [completedResults, setCompletedResults] = useState<any[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  useEffect(() => {
    attemptService.getStudentActiveExam()
      .then((summary) => {
        if (summary) {
          setActiveExam(summary);
          setTimeLeft(summary.time_remaining_seconds);
        }
      })
      .catch(() => {});

    setIsLoadingResults(true);
    attemptService.getStudentResults()
      .then((res) => setCompletedResults(res))
      .catch(() => {})
      .finally(() => setIsLoadingResults(false));
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (!user) return null;

  const availableExams = exams.filter(e => e.status === 'PUBLISHED');

  return (
    <DashboardLayout title="Student Dashboard">
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="p-6 md:p-8 rounded-3xl bg-white border border-[#EBE5DC] shadow-warm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl md:text-3xl font-bold font-serif text-stone-900">Welcome, {user.name}</h2>
              <Badge variant="student">Student</Badge>
            </div>
            <p className="text-sm text-stone-500">
              Logged in as <span className="text-stone-800 font-medium">{user.email}</span>
            </p>
          </div>
          <Link href="/student/exams">
            <Button variant="primary" className="gap-2 text-xs shadow-warm-sm">
              <BookOpen className="w-4 h-4" /> View Available Exams ({availableExams.length})
            </Button>
          </Link>
        </div>

        {/* Recent Unfinished Exam Banner (Loop 6) */}
        {activeExam && timeLeft > 0 && (
          <div className="p-6 md:p-8 rounded-3xl bg-[#FAF7F2] border-2 border-[#C25E1A]/40 shadow-warm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-[#FBECE0] text-[#C25E1A]">
                  <Clock className="w-5 h-5" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-[#C25E1A]">
                  Recent Unfinished Exam • Attempt #{activeExam.attempt_number}
                </span>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                  IN PROGRESS
                </span>
              </div>
              <h3 className="text-xl md:text-2xl font-bold font-serif text-stone-900">
                {activeExam.exam_title}
              </h3>
              <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600">
                <span>
                  Rejoins: <strong className="text-stone-900">{activeExam.rejoin_count} / {activeExam.max_rejoins}</strong>
                </span>
                <span>•</span>
                <span>
                  Verification: <strong className={activeExam.identity_verified ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                    {activeExam.identity_verified ? 'Verified ✓' : 'Pending Check'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="text-right sm:text-center p-3 bg-white rounded-2xl border border-[#EBE5DC]">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">Time Remaining</span>
                <span className="text-2xl font-mono font-bold text-[#C25E1A]">
                  {formatCountdown(timeLeft)}
                </span>
              </div>
              <Link href={`/student/exams/${activeExam.exam_id}`}>
                <Button variant="primary" size="lg" className="w-full sm:w-auto text-sm font-semibold shadow-warm gap-2 bg-[#C25E1A] hover:bg-[#A94F13]">
                  <Play className="w-4 h-4 fill-white" /> Resume Exam
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Dashboard Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Section 1: Available Exams */}
          <Card className="space-y-4 flex flex-col justify-between bg-white border-[#EBE5DC]">
            <div className="space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
                <div className="p-2 rounded-xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold font-serif text-stone-900">Available Exams</h3>
              </div>

              {availableExams.length === 0 ? (
                <p className="text-xs text-stone-500 italic">No exams available yet.</p>
              ) : (
                <div className="space-y-2">
                  {availableExams.slice(0, 3).map((e) => (
                    <div key={e.id} className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] flex justify-between items-center text-xs">
                      <div>
                        <h4 className="font-bold text-stone-900">{e.title}</h4>
                        <span className="text-[10px] text-stone-500">{e.duration_minutes} Mins • {e.question_count} Questions</span>
                      </div>
                      <Link href={`/student/exams/${e.id}/instructions`}>
                        <Button variant="primary" size="sm" className="text-[11px] py-1 px-3">
                          Start
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Link href="/student/exams" className="text-xs text-[#C25E1A] hover:text-[#A94F13] font-semibold inline-flex items-center gap-1 pt-2">
              Browse All Exams <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Card>

          {/* Section 2: Upcoming Exams */}
          <Card className="space-y-4 bg-white border-[#EBE5DC]">
            <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
              <div className="p-2 rounded-xl bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                <CalendarClock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Upcoming Exams</h3>
            </div>
            <EmptyState title="Upcoming Exams Schedule" badge="Phase 3 Feature" />
          </Card>

          {/* Section 3: Recent Results */}
          <Card className="space-y-4 flex flex-col justify-between bg-white border-[#EBE5DC]">
            <div className="space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
                <div className="p-2 rounded-xl bg-[#F3E8FF] text-[#6B21A8] border border-[#E9D5FF]">
                  <Award className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold font-serif text-stone-900">Recent Results</h3>
              </div>

              {isLoadingResults ? (
                <p className="text-xs text-stone-500 italic">Loading past score reports...</p>
              ) : completedResults.length === 0 ? (
                <p className="text-xs text-stone-500 italic">No completed exams yet.</p>
              ) : (
                <div className="space-y-2">
                  {completedResults.slice(0, 3).map((res) => (
                    <div key={res.attempt_id} className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] flex justify-between items-center text-xs">
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-stone-900 truncate max-w-[140px]">{res.exam_title}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-stone-500">
                          <span className="font-semibold text-stone-900">{res.total_score} / {res.max_possible_score}</span>
                          <span>({res.percentage}%)</span>
                          <span>•</span>
                          <span className={res.evaluation_status === 'EVALUATED' ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                            {res.evaluation_status === 'EVALUATED' ? 'Graded' : 'Pending'}
                          </span>
                        </div>
                      </div>
                      <Link href={`/student/exams/${res.exam_id}/result?attemptId=${res.attempt_id}`}>
                        <Button variant="outline" size="sm" className="text-[11px] py-1 px-2.5">
                          View
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {completedResults.length > 0 && (
              <span className="text-[11px] text-stone-400 block pt-1">
                Showing {Math.min(3, completedResults.length)} of {completedResults.length} completed
              </span>
            )}
          </Card>

        </div>

        {/* Profile Card */}
        <Card className="space-y-4 bg-white border-[#EBE5DC]">
          <h3 className="text-base font-bold font-serif text-stone-900 pb-3 border-b border-[#EBE5DC]">
            Profile Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Name</span>
              <p className="text-stone-900 font-medium">{user.name}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Email</span>
              <p className="text-stone-900 font-medium">{user.email}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Role</span>
              <p><Badge variant="student">{user.role}</Badge></p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Account Created</span>
              <p className="text-stone-900 font-medium">{new Date(user.created_at || Date.now()).toLocaleDateString()}</p>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

