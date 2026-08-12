'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ExamFormWizard, examService, Exam } from '@/features/exams';
import { Loading } from '@/components/shared/Loading';

export default function EditExamPage() {
  const params = useParams();
  const examId = params.examId as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (examId) {
      examService.getExamById(examId)
        .then(setExam)
        .finally(() => setIsLoading(false));
    }
  }, [examId]);

  if (isLoading) {
    return (
      <DashboardLayout title="Edit Exam">
        <Loading message="Loading exam settings..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Edit Exam: ${exam?.title}`}>
      <ExamFormWizard initialData={exam} examId={examId} isEditing />
    </DashboardLayout>
  );
}
