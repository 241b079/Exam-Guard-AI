'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Users, FileText, Activity, Settings, ShieldCheck } from 'lucide-react';

export default function AdminDashboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <DashboardLayout title="Admin Dashboard">
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="p-6 md:p-8 rounded-3xl bg-white border border-[#EBE5DC] shadow-warm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold font-serif text-stone-900">Welcome, {user.name}</h2>
              <Badge variant="admin">Admin</Badge>
            </div>
            <p className="text-sm text-stone-600">
              Logged in as <span className="text-stone-900 font-medium">{user.email}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 bg-[#FAF7F2] p-3 rounded-2xl border border-[#EBE5DC] text-xs text-stone-700">
            <ShieldCheck className="w-4 h-4 text-[#C25E1A]" />
            <span className="font-medium">Full System Administrator Access</span>
          </div>
        </div>

        {/* Dashboard Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Section 1: Users */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
              <div className="p-2 rounded-xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Users</h3>
            </div>
            <EmptyState title="User Management" badge="Phase 2 Feature" />
          </Card>

          {/* Section 2: Exams */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
              <div className="p-2 rounded-xl bg-[#E8F1F5] text-[#1E5D88] border border-[#CDE1EC]">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Exams</h3>
            </div>
            <EmptyState title="Global Exam Catalog" badge="Phase 2 Feature" />
          </Card>

          {/* Section 3: System Monitoring */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
              <div className="p-2 rounded-xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]">
                <Activity className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">System Monitoring</h3>
            </div>
            <EmptyState title="Server Telemetry & Logs" badge="Phase 2 Feature" />
          </Card>

          {/* Section 4: Settings */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
              <div className="p-2 rounded-xl bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                <Settings className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Settings</h3>
            </div>
            <EmptyState title="Platform Configurations" badge="Phase 2 Feature" />
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
              <p><Badge variant="admin">{user.role}</Badge></p>
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

