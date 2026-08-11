'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { FileText, Users, Eye, BarChart3, UserCheck } from 'lucide-react';

export default function FacultyDashboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <DashboardLayout title="Faculty Dashboard">
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-950/60 via-slate-800 to-slate-900 border border-amber-500/20 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-extrabold text-white">Welcome, {user.name}</h2>
              <Badge variant="faculty">Faculty</Badge>
            </div>
            <p className="text-sm text-slate-400">
              Logged in as <span className="text-slate-200 font-medium">{user.email}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs text-slate-300">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>Instructor Verified</span>
          </div>
        </div>

        {/* Dashboard Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Section 1: My Exams */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">My Exams</h3>
            </div>
            <EmptyState title="Exam Management" badge="Phase 2 Feature" />
          </Card>

          {/* Section 2: Active Students */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">Active Students</h3>
            </div>
            <EmptyState title="Student Roster" badge="Phase 2 Feature" />
          </Card>

          {/* Section 3: Proctoring Monitoring */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Eye className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">Proctoring</h3>
            </div>
            <EmptyState title="Live Proctoring Feeds" badge="Phase 2 Feature" />
          </Card>

          {/* Section 4: Results */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">Results</h3>
            </div>
            <EmptyState title="Analytics & Reports" badge="Phase 2 Feature" />
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
              <p><Badge variant="faculty">{user.role}</Badge></p>
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
