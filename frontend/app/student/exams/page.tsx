'use client';

import React from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ExamCard, useExams } from '@/features/exams';
import { Loading } from '@/components/shared/Loading';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/Button';
import { History, BookOpen } from 'lucide-react';

export default function StudentExamsPage() {
  const { exams, isLoading, error } = useExams();

  const availableExams = exams.filter(e => e.status === 'PUBLISHED');

  return (
    <DashboardLayout title="Available Examinations">
      <div className="space-y-6">
        <div className="pb-4 border-b border-[#EBE5DC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]">
                <BookOpen className="w-4 h-4" />
              </span>
              <h2 className="text-xl font-bold font-serif text-stone-900">Available Exams</h2>
            </div>
            <p className="text-xs text-stone-500">Select an exam to read instructions and begin your test attempt</p>
          </div>

          <Link href="/student/history">
            <Button variant="outline" size="sm" className="gap-2 text-xs font-semibold shadow-warm-sm border-[#D0C5B5] hover:border-[#C25E1A] hover:text-[#C25E1A]">
              <History className="w-3.5 h-3.5 text-[#C25E1A]" /> View Attempt History & Results
            </Button>
          </Link>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm shadow-warm-sm">
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

