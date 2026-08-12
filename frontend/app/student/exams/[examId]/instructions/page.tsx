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
        <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400">
          {error || 'Exam not found'}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Instructions — ${exam.title}`}>
      <div className="space-y-6 max-w-4xl mx-auto">
        <Link href="/student/exams" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Available Exams
        </Link>

        {/* Title Header */}
        <div className="p-6 glass-panel rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/30">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white">{exam.title}</h1>
              <p className="text-xs text-slate-400">Please read all guidelines carefully before starting.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-800 text-sm">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase font-semibold block">Duration</span>
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> {exam.duration_minutes} Mins
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase font-semibold block">Questions</span>
              <span className="font-bold text-brand-400 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4" /> {exam.question_count} Questions
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase font-semibold block">Total Marks</span>
              <span className="font-bold text-purple-400 flex items-center gap-1.5">
                <Award className="w-4 h-4" /> {exam.total_marks} Marks
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase font-semibold block">Negative Marking</span>
              <span className="font-bold text-slate-200">{exam.negative_marking}</span>
            </div>
          </div>
        </div>

        {/* Rules & Guidelines */}
        <Card className="space-y-4">
          <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3">
            Examination Rules & Guidelines
          </h3>
          <ul className="space-y-3 text-sm text-slate-300 list-disc list-inside">
            <li>Read each question carefully before selecting or typing your response.</li>
            <li>Do not refresh or close the browser window unnecessarily during the exam session.</li>
            <li>Your answers are saved automatically as you navigate between questions.</li>
            <li>Ensure you submit the exam before the countdown timer expires.</li>
            <li>If auto-submit is enabled, your attempt will be submitted automatically when time expires.</li>
          </ul>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <Link href="/student/exams">
            <Button variant="secondary">Back</Button>
          </Link>
          <Button
            variant="primary"
            size="lg"
            onClick={handleStartExam}
            isLoading={isStarting}
            className="gap-2 text-base shadow-xl shadow-brand-500/20"
          >
            <Play className="w-5 h-5" /> Start Exam Now
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
