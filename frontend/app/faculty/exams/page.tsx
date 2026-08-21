'use client';

import React from 'react';
import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { ExamCard, useExams, examService } from '@/features/exams';
import { Loading } from '@/components/shared/Loading';
import { EmptyState } from '@/components/shared/EmptyState';

export default function FacultyExamsPage() {
  const { exams, isLoading, error, refreshExams } = useExams();

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this exam? This action cannot be undone.')) {
      try {
        await examService.deleteExam(id);
        refreshExams();
      } catch (err: any) {
        alert(err.message || 'Failed to delete exam');
      }
    }
  };

  return (
    <DashboardLayout title="Exam Management">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBE5DC]">
          <div>
            <h2 className="text-xl font-bold font-serif text-stone-900">My Exams</h2>
            <p className="text-xs text-stone-500">Create, configure, and manage your examination papers</p>
          </div>
          <Link href="/faculty/exams/create">
            <Button variant="primary" className="gap-2 text-xs">
              <Plus className="w-4 h-4" /> Create Exam
            </Button>
          </Link>
        </div>


        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <Loading message="Fetching your exams..." />
        ) : exams.length === 0 ? (
          <div className="py-12 space-y-4 text-center">
            <EmptyState
              title="No Exams Created Yet"
              description="Click 'Create Exam' to build your first test paper and configure settings."
            />
            <Link href="/faculty/exams/create" className="inline-block">
              <Button variant="primary" className="gap-2">
                <Plus className="w-4 h-4" /> Create Your First Exam
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} isFaculty onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
