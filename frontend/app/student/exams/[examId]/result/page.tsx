'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, Award, Clock, HelpCircle, ArrowRight, BookOpen } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { attemptService, SubmitAttemptResponse } from '@/features/attempts';
import { Loading } from '@/components/shared/Loading';

export default function StudentExamResultPage() {
  const params = useParams();
  const examId = params.examId as string;

  const [result, setResult] = useState<SubmitAttemptResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadResult() {
      setIsLoading(true);
      setError(null);
      try {
        const att = await attemptService.startOrResumeAttempt(examId);
        const submitData = await attemptService.submitAttempt(att.id);
        setResult(submitData);
      } catch (err: any) {
        setError(err.message || 'Failed to load submission status');
      } finally {
        setIsLoading(false);
      }
    }

    if (examId) loadResult();
  }, [examId]);

  if (isLoading) {
    return (
      <DashboardLayout title="Exam Result">
        <Loading message="Calculating assessment results..." />
      </DashboardLayout>
    );
  }

  if (error || !result) {
    return (
      <DashboardLayout title="Exam Result">
        <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400">
          {error || 'Result unavailable'}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Exam Submission & Result">
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Banner Card */}
        <div className="p-8 glass-panel rounded-2xl border border-emerald-500/30 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <Badge variant="success">Exam Submitted Successfully</Badge>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">{result.exam_title}</h1>
            <p className="text-xs text-slate-400">
              Submitted on {new Date(result.submitted_at).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Score Breakdown Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="space-y-1 text-center">
            <span className="text-xs font-semibold text-slate-400 uppercase">Questions</span>
            <p className="text-2xl font-bold text-white">{result.total_questions}</p>
          </Card>

          <Card className="space-y-1 text-center">
            <span className="text-xs font-semibold text-slate-400 uppercase">Attempted</span>
            <p className="text-2xl font-bold text-brand-400">{result.attempted_questions}</p>
          </Card>

          <Card className="space-y-1 text-center">
            <span className="text-xs font-semibold text-slate-400 uppercase">Correct MCQs</span>
            <p className="text-2xl font-bold text-emerald-400">{result.correct_mcq_count}</p>
          </Card>

          <Card className="space-y-1 text-center">
            <span className="text-xs font-semibold text-slate-400 uppercase">Score (MCQ)</span>
            <p className="text-2xl font-bold text-purple-400">{result.total_score} / {result.max_possible_score}</p>
          </Card>
        </div>

        {/* Status Summary Card */}
        <Card className="space-y-3">
          <h3 className="text-sm font-bold text-white pb-2 border-b border-slate-800">
            Evaluation Breakdown
          </h3>
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <span>Multiple Choice (MCQs)</span>
              <span className="font-semibold text-emerald-400">Graded Automatically</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <span>Short Answer Questions</span>
              <span className="font-semibold text-amber-400">{result.short_answer_status}</span>
            </div>
          </div>
        </Card>

        {/* Action Button */}
        <div className="text-center pt-4">
          <Link href="/student/dashboard">
            <Button variant="primary" size="lg" className="gap-2">
              <BookOpen className="w-5 h-5" /> Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
