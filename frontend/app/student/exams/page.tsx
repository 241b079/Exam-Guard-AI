'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ExamCard, useExams } from '@/features/exams';
import { Loading } from '@/components/shared/Loading';
import { EmptyState } from '@/components/shared/EmptyState';

export default function StudentExamsPage() {
  const { exams, isLoading, error } = useExams();

  const availableExams = exams.filter(e => e.status === 'PUBLISHED');

  return (
    <DashboardLayout title="Available Examinations">
      <div className="space-y-6">
        <div className="pb-4 border-b border-slate-800">
          <h2 className="text-xl font-bold text-white">Available Exams</h2>
          <p className="text-xs text-slate-400">Select an exam to read instructions and begin your test attempt</p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <Loading message="Searching for available exams..." />
        ) : availableExams.length === 0 ? (
          <EmptyState
            title="No Exams Currently Available"
            description="Your instructor has not published any active exams for your account yet."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableExams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} isFaculty={false} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
