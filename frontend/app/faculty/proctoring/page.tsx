'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Eye, Radio, ShieldCheck, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/shared/Loading';
import { proctoringService, ProctoringOverviewItem } from '@/features/proctoring';

export default function FacultyProctoringOverviewPage() {
  const [overview, setOverview] = useState<ProctoringOverviewItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await proctoringService.getOverview();
      setOverview(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load proctoring overview');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 10000); // 10s auto poll
    return () => clearInterval(interval);
  }, []);

  return (
    <DashboardLayout title="Live Proctoring Hub">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBE5DC]">
          <div>
            <h2 className="text-xl font-bold font-serif text-stone-900 flex items-center gap-2">
              <Eye className="w-5 h-5 text-[#C25E1A]" /> AI Live Proctoring Control Room
            </h2>
            <p className="text-xs text-stone-500">
              Monitor active student sessions, webcam feeds, tab-switch infractions, and integrity scores in real-time.
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={fetchOverview} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Feeds
          </Button>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {error}
          </div>
        )}

        {isLoading && overview.length === 0 ? (
          <Loading message="Fetching active proctoring feeds..." />
        ) : overview.length === 0 ? (
          <div className="p-12 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm text-center space-y-3">
            <Radio className="w-8 h-8 text-stone-400 mx-auto animate-pulse" />
            <h3 className="text-base font-bold font-serif text-stone-800">No Exams Scheduled</h3>
            <p className="text-xs text-stone-500">
              Create an exam with AI Proctoring enabled to view live feeds here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {overview.map((item) => (
              <div
                key={item.exam_id}
                className="bg-white p-6 rounded-3xl border border-[#EBE5DC] shadow-warm flex flex-col justify-between space-y-4 hover:border-[#D0C5B5] transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-bold font-serif text-stone-900 line-clamp-1">
                      {item.exam_title}
                    </h3>
                    <Badge variant={item.enable_proctoring ? 'info' : 'faculty'}>
                      {item.enable_proctoring ? 'PROCTORED' : 'STANDARD'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2 border-t border-[#EBE5DC]">
                    <div className="p-2.5 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC]">
                      <span className="text-[10px] text-stone-500 block uppercase font-semibold">Active</span>
                      <strong className="text-sm font-bold text-emerald-700">{item.active_attempts}</strong>
                    </div>

                    <div className="p-2.5 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC]">
                      <span className="text-[10px] text-stone-500 block uppercase font-semibold">Flagged</span>
                      <strong className={`text-sm font-bold ${item.flagged_attempts > 0 ? 'text-rose-600' : 'text-stone-700'}`}>
                        {item.flagged_attempts}
                      </strong>
                    </div>

                    <div className="p-2.5 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC]">
                      <span className="text-[10px] text-stone-500 block uppercase font-semibold">Total</span>
                      <strong className="text-sm font-bold text-stone-900">{item.total_attempts}</strong>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#EBE5DC]">
                  <Link href={`/faculty/exams/${item.exam_id}/proctoring`} className="w-full">
                    <Button variant="primary" size="md" className="w-full text-xs font-semibold gap-1.5">
                      Enter Live Room <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
