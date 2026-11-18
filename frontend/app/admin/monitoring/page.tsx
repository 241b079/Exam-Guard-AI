'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { adminService, AdminTelemetry } from '@/features/admin';
import {
  Activity,
  Server,
  Database,
  Cpu,
  Radio,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Layers,
  AlertTriangle,
} from 'lucide-react';

export default function AdminMonitoringPage() {
  const [telemetry, setTelemetry] = useState<AdminTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchTelemetry = async () => {
    setIsLoading(true);
    try {
      const data = await adminService.getTelemetry();
      setTelemetry(data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load telemetry:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, []);

  return (
    <DashboardLayout title="Admin — System Telemetry & Logs">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBE5DC]">
          <div>
            <h2 className="text-xl font-bold font-serif text-stone-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              Live Server Telemetry & Proctoring Health
            </h2>
            <p className="text-xs text-stone-600">
              Real-time monitoring of backend infrastructure, database ping, active WebSockets, and proctoring incidents.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-stone-500">
              Updated: {lastRefreshed.toLocaleTimeString()}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchTelemetry}
              disabled={isLoading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Top Health Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="space-y-2 border border-[#EBE5DC]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                PostgreSQL DB
              </span>
              <Database className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-stone-900">
                {telemetry?.system_health.postgres_latency_ms ?? 0} ms
              </span>
              <Badge variant="success">
                {telemetry?.system_health.postgres || 'healthy'}
              </Badge>
            </div>
            <p className="text-[11px] text-stone-500">Query execution roundtrip latency</p>
          </Card>

          <Card className="space-y-2 border border-[#EBE5DC]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Redis Session Cache
              </span>
              <Cpu className="w-4 h-4 text-[#C25E1A]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-stone-900 capitalize">
                {telemetry?.system_health.redis || 'healthy'}
              </span>
            </div>
            <p className="text-[11px] text-stone-500">Session tokens & pub/sub pipeline</p>
          </Card>

          <Card className="space-y-2 border border-[#EBE5DC]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Active WebSockets
              </span>
              <Radio className="w-4 h-4 text-[#1E5D88]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-stone-900">
                {telemetry?.connections.active_candidate_sessions ?? 0}
              </span>
              <Badge variant="neutral">Live Peers</Badge>
            </div>
            <p className="text-[11px] text-stone-500">Connected exam candidate video streams</p>
          </Card>

          <Card className="space-y-2 border border-[#EBE5DC]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Active Exams
              </span>
              <Layers className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-stone-900">
                {telemetry?.exams.published ?? 0}
              </span>
              <span className="text-xs text-stone-500">
                ({telemetry?.attempts.in_progress ?? 0} attempts in progress)
              </span>
            </div>
            <p className="text-[11px] text-stone-500">Live published exam instances</p>
          </Card>
        </div>

        {/* Violations and Proctoring Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Violations by Category */}
          <Card className="space-y-4 border border-[#EBE5DC]">
            <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-bold font-serif text-stone-900">
                  Recorded Violations by Category
                </h3>
              </div>
              <Badge variant="neutral">{telemetry?.violations.total ?? 0} Total</Badge>
            </div>

            {telemetry?.violations.by_type && Object.keys(telemetry.violations.by_type).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(telemetry.violations.by_type).map(([vType, count]) => (
                  <div
                    key={vType}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] text-xs"
                  >
                    <span className="font-semibold text-stone-800">{vType}</span>
                    <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 font-bold">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-stone-500">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                No exam violations currently recorded in database.
              </div>
            )}
          </Card>

          {/* Proctoring Event Review Pipeline */}
          <Card className="space-y-4 border border-[#EBE5DC]">
            <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold font-serif text-stone-900">
                  Proctoring Review Pipeline
                </h3>
              </div>
              <Badge variant="neutral">{telemetry?.proctoring.total_events ?? 0} Events</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                <span className="text-[11px] text-amber-700 font-semibold block uppercase">
                  Pending Faculty Review
                </span>
                <span className="text-xl font-bold text-amber-900">
                  {telemetry?.proctoring.pending_review ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-red-50 border border-red-200">
                <span className="text-[11px] text-red-700 font-semibold block uppercase">
                  Confirmed Cheating
                </span>
                <span className="text-xl font-bold text-red-900">
                  {telemetry?.proctoring.confirmed ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                <span className="text-[11px] text-emerald-700 font-semibold block uppercase">
                  Dismissed / Cleared
                </span>
                <span className="text-xl font-bold text-emerald-900">
                  {telemetry?.proctoring.dismissed ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-stone-100 border border-stone-200">
                <span className="text-[11px] text-stone-600 font-semibold block uppercase">
                  False Positives
                </span>
                <span className="text-xl font-bold text-stone-900">
                  {telemetry?.proctoring.false_positives ?? 0}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Live Audit Stream */}
        <Card className="space-y-4 border border-[#EBE5DC]">
          <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-stone-500" />
              <h3 className="text-sm font-bold font-serif text-stone-900">
                Recent Platform Audit Stream
              </h3>
            </div>
            <span className="text-[11px] text-stone-500">Live timestamped log</span>
          </div>

          <div className="space-y-2">
            {telemetry?.recent_activity && telemetry.recent_activity.length > 0 ? (
              telemetry.recent_activity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        item.type === 'VIOLATION_DETECTED'
                          ? 'bg-red-500'
                          : item.type === 'EXAM_CREATED'
                          ? 'bg-[#1E5D88]'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <span className="font-semibold text-stone-800">{item.description}</span>
                  </div>
                  <span className="text-[11px] text-stone-500">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-stone-500 text-center py-4">No recent activity logged.</p>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
