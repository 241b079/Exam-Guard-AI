'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { adminService, AdminTelemetry } from '@/features/admin';
import {
  Users,
  FileText,
  Activity,
  Settings,
  ShieldCheck,
  Server,
  ArrowRight,
  Radio,
  Clock,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [telemetry, setTelemetry] = useState<AdminTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await adminService.getTelemetry();
        if (mounted) setTelemetry(data);
      } catch (err) {
        console.error('Failed to load telemetry:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

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

        {/* Live System Health Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-stone-900 to-stone-800 text-white flex flex-wrap items-center justify-between gap-4 shadow-warm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-emerald-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight">System Status: Operational</span>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-xs text-stone-400">
                PostgreSQL: {telemetry?.system_health.postgres || 'healthy'} ({telemetry?.system_health.postgres_latency_ms ?? 0}ms) • Redis: {telemetry?.system_health.redis || 'healthy'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <Radio className="w-3.5 h-3.5 text-[#F6D6C0]" />
              <span>Live Connections: <strong>{telemetry?.connections.active_candidate_sessions ?? 0}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
              <Clock className="w-3.5 h-3.5 text-stone-300" />
              <span>Environment: <strong>{telemetry?.system_health.app_env || 'production'}</strong></span>
            </div>
          </div>
        </div>

        {/* 4 Core Modules Overview Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Section 1: Users */}
          <Card className="flex flex-col justify-between space-y-4 hover:border-stone-400 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
                    <Users className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold font-serif text-stone-900">Users</h3>
                </div>
                <Badge variant="neutral">{telemetry?.users.total ?? 0} Total</Badge>
              </div>

              <div className="space-y-1.5 text-xs text-stone-600">
                <div className="flex justify-between">
                  <span>Students:</span>
                  <span className="font-semibold text-stone-900">{telemetry?.users.students ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Faculty:</span>
                  <span className="font-semibold text-stone-900">{telemetry?.users.faculty ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Administrators:</span>
                  <span className="font-semibold text-stone-900">{telemetry?.users.admins ?? 0}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#EBE5DC]/60 text-emerald-700">
                  <span>Active Accounts:</span>
                  <span className="font-semibold">{telemetry?.users.active ?? 0}</span>
                </div>
              </div>
            </div>

            <Link href="/admin/users" className="pt-2">
              <Button variant="secondary" className="w-full text-xs justify-between group">
                Manage Directory
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </Card>

          {/* Section 2: Global Exams */}
          <Card className="flex flex-col justify-between space-y-4 hover:border-stone-400 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#E8F1F5] text-[#1E5D88] border border-[#CDE1EC]">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold font-serif text-stone-900">Exams</h3>
                </div>
                <Badge variant="neutral">{telemetry?.exams.total ?? 0} Total</Badge>
              </div>

              <div className="space-y-1.5 text-xs text-stone-600">
                <div className="flex justify-between">
                  <span>Published:</span>
                  <span className="font-semibold text-emerald-700">{telemetry?.exams.published ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Drafts:</span>
                  <span className="font-semibold text-amber-700">{telemetry?.exams.draft ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Closed:</span>
                  <span className="font-semibold text-stone-600">{telemetry?.exams.closed ?? 0}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#EBE5DC]/60">
                  <span>Total Attempts:</span>
                  <span className="font-semibold text-stone-900">{telemetry?.attempts.total ?? 0}</span>
                </div>
              </div>
            </div>

            <Link href="/admin/exams" className="pt-2">
              <Button variant="secondary" className="w-full text-xs justify-between group">
                Global Exam Catalog
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </Card>

          {/* Section 3: System Monitoring */}
          <Card className="flex flex-col justify-between space-y-4 hover:border-stone-400 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]">
                    <Activity className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold font-serif text-stone-900">Monitoring</h3>
                </div>
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>

              <div className="space-y-1.5 text-xs text-stone-600">
                <div className="flex justify-between">
                  <span>Active Attempts:</span>
                  <span className="font-semibold text-[#C25E1A]">{telemetry?.attempts.in_progress ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Violations:</span>
                  <span className="font-semibold text-red-700">{telemetry?.violations.total ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pending Review:</span>
                  <span className="font-semibold text-amber-700">{telemetry?.proctoring.pending_review ?? 0}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#EBE5DC]/60">
                  <span>Live WebSockets:</span>
                  <span className="font-semibold text-stone-900">{telemetry?.connections.active_candidate_sessions ?? 0}</span>
                </div>
              </div>
            </div>

            <Link href="/admin/monitoring" className="pt-2">
              <Button variant="secondary" className="w-full text-xs justify-between group">
                Telemetry & Logs
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </Card>

          {/* Section 4: Settings */}
          <Card className="flex flex-col justify-between space-y-4 hover:border-stone-400 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                    <Settings className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold font-serif text-stone-900">Settings</h3>
                </div>
                <Badge variant="neutral">Active</Badge>
              </div>

              <div className="space-y-1.5 text-xs text-stone-600">
                <div className="flex justify-between">
                  <span>AI Face Verification:</span>
                  <span className="font-semibold text-emerald-700">ArcFace Enabled</span>
                </div>
                <div className="flex justify-between">
                  <span>Head Pose & Gaze:</span>
                  <span className="font-semibold text-emerald-700">Active</span>
                </div>
                <div className="flex justify-between">
                  <span>Object Detection:</span>
                  <span className="font-semibold text-emerald-700">NanoDet Active</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#EBE5DC]/60">
                  <span>Lockdown Enforcement:</span>
                  <span className="font-semibold text-[#C25E1A]">Strict</span>
                </div>
              </div>
            </div>

            <Link href="/admin/settings" className="pt-2">
              <Button variant="secondary" className="w-full text-xs justify-between group">
                Platform Policies
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </Card>
        </div>

        {/* Profile Card */}
        <Card className="space-y-4">
          <h3 className="text-base font-bold font-serif text-stone-900 pb-3 border-b border-[#EBE5DC]">
            Administrator Identity
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
