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
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 shadow-warm">
          {error || 'Result unavailable'}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Exam Submission & Result">
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Banner Card */}
        <div className="p-8 bg-white rounded-3xl border border-[#EBE5DC] text-center space-y-4 shadow-warm">
          <div className="w-16 h-16 rounded-full bg-[#DEF7EC] border border-[#BCF0DA] text-[#03543F] flex items-center justify-center mx-auto shadow-warm-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <Badge variant="success">Exam Submitted Successfully</Badge>
            <h1 className="text-2xl font-bold font-serif text-stone-900 tracking-tight">{result.exam_title}</h1>
            <p className="text-xs text-stone-500">
              Submitted on {new Date(result.submitted_at).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Score Breakdown Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="space-y-1 text-center bg-white border-[#EBE5DC]">
            <span className="text-xs font-semibold text-stone-500 uppercase">Questions</span>
            <p className="text-2xl font-bold font-serif text-stone-900">{result.total_questions}</p>
          </Card>

          <Card className="space-y-1 text-center bg-white border-[#EBE5DC]">
            <span className="text-xs font-semibold text-stone-500 uppercase">Attempted</span>
            <p className="text-2xl font-bold font-serif text-[#C25E1A]">{result.attempted_questions}</p>
          </Card>

          <Card className="space-y-1 text-center bg-white border-[#EBE5DC]">
            <span className="text-xs font-semibold text-stone-500 uppercase">Correct MCQs</span>
            <p className="text-2xl font-bold font-serif text-emerald-800">{result.correct_mcq_count}</p>
          </Card>

          <Card className="space-y-1 text-center bg-white border-[#EBE5DC]">
            <span className="text-xs font-semibold text-stone-500 uppercase">Score (MCQ)</span>
            <p className="text-2xl font-bold font-serif text-stone-900">{result.total_score} / {result.max_possible_score}</p>
          </Card>
        </div>

        {/* Status Summary Card */}
        <Card className="space-y-3 bg-white border-[#EBE5DC]">
          <h3 className="text-sm font-bold font-serif text-stone-900 pb-2 border-b border-[#EBE5DC]">
            Evaluation Breakdown
          </h3>
          <div className="space-y-2 text-xs text-stone-700">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC]">
              <span>Multiple Choice (MCQs)</span>
              <span className="font-semibold text-emerald-800">Graded Automatically</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC]">
              <span>Short Answer Questions</span>
              <span className="font-semibold text-amber-800">{result.short_answer_status}</span>
            </div>
          </div>
        </Card>

        {/* Action Button */}
        <div className="text-center pt-4">
          <Link href="/student/dashboard">
            <Button variant="primary" size="lg" className="gap-2 shadow-warm">
              <BookOpen className="w-5 h-5" /> Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}

