'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Upload, FileSpreadsheet } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ImportQuestionsModal } from '@/features/questions';
import { Button } from '@/components/ui/Button';

export default function FacultyImportQuestionsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.examId as string;

  const [isModalOpen, setIsModalOpen] = useState(true);

  return (
    <DashboardLayout title="Import Questions">
      <div className="space-y-6">
        <Link href={`/faculty/exams/${examId}/questions`} className="inline-flex items-center gap-2 text-xs text-stone-500 hover:text-stone-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Question Builder
        </Link>

        <div className="bg-white p-8 md:p-10 rounded-3xl border border-[#EBE5DC] shadow-warm space-y-6 max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA] flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-serif text-stone-900">Import Questions via CSV / Excel</h1>
            <p className="text-sm text-stone-600 max-w-lg mx-auto">
              Bulk import questions into your exam using a structured CSV file with options and answers.
            </p>
          </div>

          <div className="bg-[#FAF7F2] p-5 rounded-2xl border border-[#EBE5DC] text-left text-xs text-stone-700 space-y-2">
            <p className="font-bold text-stone-900 uppercase tracking-wider">CSV Format Specification:</p>
            <ul className="list-disc list-inside space-y-1 text-stone-600">
              <li><strong>type</strong>: MCQ or SHORT_ANSWER</li>
              <li><strong>question</strong>: Question text prompt</li>
              <li><strong>option A, option B, option C, option D</strong>: Choices for MCQ</li>
              <li><strong>correct</strong>: Exact text of correct answer</li>
              <li><strong>marks</strong>: Points awarded (e.g. 5.0)</li>
            </ul>
          </div>

          <Button variant="primary" size="lg" onClick={() => setIsModalOpen(true)} className="gap-2">
            <Upload className="w-5 h-5" /> Launch Import Uploader
          </Button>
        </div>
      </div>


      <ImportQuestionsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        examId={examId}
        onImported={() => {
          router.push(`/faculty/exams/${examId}/questions`);
        }}
      />
    </DashboardLayout>
  );
}
