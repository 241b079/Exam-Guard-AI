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
              <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
                <div className="p-2 rounded-xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold font-serif text-stone-900">My Exams</h3>
              </div>

              {exams.length === 0 ? (
                <p className="text-xs text-stone-500 italic">No exams created yet.</p>
              ) : (
                <div className="space-y-2">
                  {exams.slice(0, 3).map((e) => (
                    <div key={e.id} className="p-2.5 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] flex justify-between items-center text-xs">
                      <div>
                        <h4 className="font-bold font-serif text-stone-900 line-clamp-1">{e.title}</h4>
                        <span className="text-[10px] text-stone-500">{e.status} • {e.question_count} Qs</span>
                      </div>
                      <Link href={`/faculty/exams/${e.id}`}>
                        <Button variant="secondary" size="sm" className="text-[10px] py-1 px-2.5">
                          Manage
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Link href="/faculty/exams" className="text-xs text-[#C25E1A] hover:text-[#A94F13] font-semibold inline-flex items-center gap-1 pt-2">
              View All Exams <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Card>

          {/* Section 2: Active Students */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
              <div className="p-2 rounded-xl bg-[#E8F1F5] text-[#1E5D88] border border-[#CDE1EC]">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Active Students</h3>
            </div>
            <EmptyState title="Student Roster" badge="Phase 3 Feature" />
          </Card>

          {/* Section 3: Proctoring Monitoring */}
          <Card className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
                <div className="p-2 rounded-xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
                  <Eye className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold font-serif text-stone-900">Live Proctoring</h3>
              </div>
              <p className="text-xs text-stone-600">
                View candidate video feeds, live telemetry, and integrity trust scores.
              </p>
            </div>

            <Link href="/faculty/proctoring" className="text-xs text-[#C25E1A] hover:text-[#A94F13] font-semibold inline-flex items-center gap-1 pt-2">
              Launch Control Room <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Card>


          {/* Section 4: Results */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
              <div className="p-2 rounded-xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Results</h3>
            </div>
            <EmptyState title="Analytics & Reports" badge="Phase 3 Feature" />
          </Card>
        </div>

        {/* Profile Card */}
        <Card className="space-y-4">
          <h3 className="text-base font-bold font-serif text-stone-900 pb-3 border-b border-[#EBE5DC]">
            Profile Information
          </h3>
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

