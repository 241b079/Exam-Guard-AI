'use client';

import React from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/shared/EmptyState';
import { useExams } from '@/features/exams';
import { BookOpen, CalendarClock, Award, UserCheck, ArrowRight } from 'lucide-react';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const { exams } = useExams();

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
          <Card className="space-y-4 bg-white border-[#EBE5DC]">
            <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
              <div className="p-2 rounded-xl bg-[#F3E8FF] text-[#6B21A8] border border-[#E9D5FF]">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Recent Results</h3>
            </div>
            <EmptyState title="Grades & Transcripts" badge="Phase 3 Feature" />
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

