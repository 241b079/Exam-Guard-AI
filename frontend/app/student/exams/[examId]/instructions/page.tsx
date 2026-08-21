'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ShieldCheck, Clock, HelpCircle, Award, ArrowLeft, Play } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Exam, examService } from '@/features/exams';
import { attemptService } from '@/features/attempts';
import { Loading } from '@/components/shared/Loading';

export default function StudentExamInstructionsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.examId as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (examId) {
      examService.getExamById(examId)
        .then(setExam)
        .catch((err) => setError(err.message || 'Failed to load exam instructions'))
        .finally(() => setIsLoading(false));
    }
  }, [examId]);

  const handleStartExam = async () => {
    setIsStarting(true);
    setError(null);
    try {
      await attemptService.startOrResumeAttempt(examId);
      router.push(`/student/exams/${examId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to start exam attempt');
      setIsStarting(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Exam Instructions">
        <Loading message="Loading test details..." />
      </DashboardLayout>
    );
  }

  if (error || !exam) {
    return (
      <DashboardLayout title="Exam Instructions">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 shadow-warm">
          {error || 'Exam not found'}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Instructions — ${exam.title}`}>
      <div className="space-y-6 max-w-4xl mx-auto">
        <Link href="/student/exams" className="inline-flex items-center gap-2 text-xs text-stone-500 hover:text-stone-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Available Exams
        </Link>

        {/* Title Header */}
        <div className="p-6 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-serif text-stone-900">{exam.title}</h1>
              <p className="text-xs text-stone-500">Please read all guidelines carefully before starting.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[#EBE5DC] text-sm">
            <div className="space-y-1">
              <span className="text-xs text-stone-500 uppercase font-semibold block">Duration</span>
              <span className="font-bold text-amber-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#C25E1A]" /> {exam.duration_minutes} Mins
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-stone-500 uppercase font-semibold block">Questions</span>
              <span className="font-bold text-stone-900 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-[#C25E1A]" /> {exam.question_count} Questions
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-stone-500 uppercase font-semibold block">Total Marks</span>
              <span className="font-bold text-stone-900 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-700" /> {exam.total_marks} Marks
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-stone-500 uppercase font-semibold block">Negative Marking</span>
              <span className="font-bold text-stone-800">{exam.negative_marking}</span>
            </div>
          </div>
        </div>

        {/* Rules & Guidelines */}
        <Card className="space-y-4">
          <h3 className="text-base font-bold font-serif text-stone-900 border-b border-[#EBE5DC] pb-3">
            Examination Rules & Guidelines
          </h3>
          <ul className="space-y-3 text-sm text-stone-700 list-disc list-inside">
            <li>Read each question carefully before selecting or typing your response.</li>
            <li>Do not refresh or close the browser window unnecessarily during the exam session.</li>
            <li>Your answers are saved automatically as you navigate between questions.</li>
            <li>Ensure you submit the exam before the countdown timer expires.</li>
            <li>If auto-submit is enabled, your attempt will be submitted automatically when time expires.</li>
          </ul>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#EBE5DC]">
          <Link href="/student/exams">
            <Button variant="secondary">Back</Button>
          </Link>
          <Button
            variant="primary"
            size="lg"
            onClick={handleStartExam}
            isLoading={isStarting}
            className="gap-2 text-base shadow-warm"
          >
            <Play className="w-5 h-5" /> Start Exam Now
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

