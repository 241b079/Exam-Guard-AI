'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { BookOpen, CalendarClock, Award, UserCheck } from 'lucide-react';

export default function StudentDashboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <DashboardLayout title="Student Dashboard">
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-brand-900/60 via-slate-800 to-slate-900 border border-brand-500/20 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-extrabold text-white">Welcome, {user.name}</h2>
              <Badge variant="student">Student</Badge>
            </div>
            <p className="text-sm text-slate-400">
              Logged in as <span className="text-slate-200 font-medium">{user.email}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs text-slate-300">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>Account Active</span>
          </div>
        </div>

        {/* Dashboard Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Section 1: Available Exams */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">Available Exams</h3>
            </div>
            <p className="text-sm text-slate-400 italic">No exams available yet.</p>
          </Card>

          {/* Section 2: Upcoming Exams */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <CalendarClock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">Upcoming Exams</h3>
            </div>
            <EmptyState title="Upcoming Exams Schedule" badge="Phase 2 Feature" />
          </Card>

          {/* Section 3: Recent Results */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">Recent Results</h3>
            </div>
            <EmptyState title="Grades & Transcripts" badge="Phase 2 Feature" />
          </Card>
        </div>

        {/* Profile Card */}
        <Card className="space-y-4">
          <h3 className="text-base font-bold text-slate-100 pb-3 border-b border-slate-800">
            Profile Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Name</span>
              <p className="text-slate-100 font-medium">{user.name}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Email</span>
              <p className="text-slate-100 font-medium">{user.email}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Role</span>
              <p><Badge variant="student">{user.role}</Badge></p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Account Created</span>
              <p className="text-slate-100 font-medium">{new Date(user.created_at || Date.now()).toLocaleDateString()}</p>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
