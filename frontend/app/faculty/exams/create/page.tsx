'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ExamFormWizard } from '@/features/exams';

export default function CreateExamPage() {
  return (
    <DashboardLayout title="Create New Exam">
      <ExamFormWizard />
    </DashboardLayout>
  );
}
