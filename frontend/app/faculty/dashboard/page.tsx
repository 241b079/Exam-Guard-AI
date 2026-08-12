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
import { FileText, Users, Eye, BarChart3, Plus, ArrowRight } from 'lucide-react';

export default function FacultyDashboardPage() {
  const { user } = useAuth();
  const { exams } = useExams();

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
          <div className="flex items-center gap-3">
            <Link href="/faculty/exams">
              <Button variant="secondary" className="gap-2 text-xs">
                <FileText className="w-4 h-4" /> Manage Exams ({exams.length})
              </Button>
            </Link>
            <Link href="/faculty/exams/create">
              <Button variant="primary" className="gap-2 text-xs">
                <Plus className="w-4 h-4" /> Create Exam
              </Button>
            </Link>
          </div>
        </div>

        {/* Dashboard Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Section 1: My Exams */}
          <Card className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-100">My Exams</h3>
              </div>

              {exams.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No exams created yet.</p>
              ) : (
                <div className="space-y-2">
                  {exams.slice(0, 3).map((e) => (
                    <div key={e.id} className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                      <div>
                        <h4 className="font-bold text-slate-100 line-clamp-1">{e.title}</h4>
                        <span className="text-[10px] text-slate-400">{e.status} • {e.question_count} Qs</span>
                      </div>
                      <Link href={`/faculty/exams/${e.id}`}>
                        <Button variant="secondary" size="sm" className="text-[10px] py-1 px-2">
                          Manage
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Link href="/faculty/exams" className="text-xs text-amber-400 hover:text-amber-300 font-semibold inline-flex items-center gap-1 pt-2">
              View All Exams <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Card>

          {/* Section 2: Active Students */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">Active Students</h3>
            </div>
            <EmptyState title="Student Roster" badge="Phase 3 Feature" />
          </Card>

          {/* Section 3: Proctoring Monitoring */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Eye className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">Proctoring</h3>
            </div>
            <EmptyState title="Live Proctoring Feeds" badge="Phase 3 Feature" />
          </Card>

          {/* Section 4: Results */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">Results</h3>
            </div>
            <EmptyState title="Analytics & Reports" badge="Phase 3 Feature" />
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
