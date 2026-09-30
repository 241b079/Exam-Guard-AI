'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Award,
  Clock,
  Printer,
  BookOpen,
  ArrowLeft,
  Check,
  X,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { attemptService, AttemptReviewResponse } from '@/features/attempts';
import { Loading } from '@/components/shared/Loading';

export default function StudentExamResultPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const examId = params.examId as string;
  const attemptIdParam = searchParams.get('attemptId') || undefined;

  const [result, setResult] = useState<AttemptReviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadResult = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await attemptService.getMyExamResult(examId, attemptIdParam);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load examination result');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (examId) {
      loadResult();
    }
  }, [examId, attemptIdParam]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Exam Result">
        <Loading message="Retrieving assessment result & score report..." />
      </DashboardLayout>
    );
  }

  if (error || !result) {
    return (
      <DashboardLayout title="Exam Result">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-rose-800 shadow-warm space-y-3">
            <div className="flex items-center gap-2 font-bold text-base">
              <AlertCircle className="w-5 h-5 text-rose-600" />
              Unable to Retrieve Result
            </div>
            <p className="text-xs text-rose-700">{error || 'Result unavailable for this exam attempt.'}</p>
            <div className="pt-2">
              <Link href="/student/dashboard">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                  <ArrowLeft className="w-3.5 h-3.5" /> Return to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isEvaluated = result.evaluation_status === 'EVALUATED';
  const percentage = result.percentage ?? (result.max_possible_score > 0 ? Math.round((result.total_score / result.max_possible_score) * 100) : 0);

  return (
    <DashboardLayout title="Exam Result & Score Report">
      {/* Global print stylesheet to guarantee clean PDF output */}
      <style jsx global>{`
        @media print {
          /* Hide all app chrome and interactive buttons */
          nav, aside, header, footer, .no-print, button, a[href*="dashboard"] {
            display: none !important;
          }
          /* Reset backgrounds for clean black & white or color printing */
          body {
            background: #ffffff !important;
            color: #1c1917 !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-container {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .print-card {
            border: 1px solid #d6d3d1 !important;
            box-shadow: none !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .page-break-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="space-y-6 max-w-4xl mx-auto print-container">
        {/* Navigation & Action Bar (Hidden in Print) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
          <Link
            href="/student/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Student Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-2 text-xs font-semibold shadow-warm-sm hover:bg-[#FAF7F2]"
            >
              <Printer className="w-4 h-4 text-[#C25E1A]" /> Print / Save as PDF
            </Button>
            <Link href="/student/dashboard">
              <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
                <BookOpen className="w-4 h-4" /> Dashboard
              </Button>
            </Link>
          </div>
        </div>

        {/* Printable Score Report Card */}
        <div className="p-8 bg-white rounded-3xl border border-[#EBE5DC] text-center space-y-4 shadow-warm print-card">
          {/* Header branding visible in print */}
          <div className="hidden print:block text-left border-b border-stone-200 pb-4 mb-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold font-serif text-stone-900">Exam-Guard AI Portal</h2>
                <p className="text-xs text-stone-500">Official Candidate Examination Performance Report</p>
              </div>
              <div className="text-right text-xs text-stone-500">
                <p>Report Date: {new Date().toLocaleDateString()}</p>
                <p>Status: {result.status}</p>
              </div>
            </div>
          </div>

          <div className="w-16 h-16 rounded-full bg-[#DEF7EC] border border-[#BCF0DA] text-[#03543F] flex items-center justify-center mx-auto shadow-warm-sm no-print">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <Badge variant={result.status === 'SUBMITTED' ? 'success' : 'faculty'}>
                {result.status === 'SUBMITTED' ? 'Exam Completed' : result.status}
              </Badge>
              <Badge variant={isEvaluated ? 'success' : 'student'}>
                {isEvaluated ? 'Evaluation Complete' : 'Manual Review Pending'}
              </Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-serif text-stone-900 tracking-tight">
              {result.exam_title}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-stone-500 pt-1">
              <span>Candidate: <strong className="text-stone-900">{result.student.name}</strong></span>
              {result.student.roll_number && (
                <>
                  <span>•</span>
                  <span>Roll No: <strong className="text-stone-900">{result.student.roll_number}</strong></span>
                </>
              )}
              <span>•</span>
              <span>Attempt #{result.attempt_number}</span>
              {result.submitted_at && (
                <>
                  <span>•</span>
                  <span>Submitted: {new Date(result.submitted_at).toLocaleString()}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Score Breakdown Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print-card">
          <Card className="space-y-1 text-center bg-white border-[#EBE5DC]">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Total Score</span>
            <p className="text-2xl md:text-3xl font-bold font-serif text-[#C25E1A]">
              {result.total_score} <span className="text-sm font-normal text-stone-500">/ {result.max_possible_score}</span>
            </p>
          </Card>

          <Card className="space-y-1 text-center bg-white border-[#EBE5DC]">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Percentage</span>
            <p className="text-2xl md:text-3xl font-bold font-serif text-stone-900">
              {percentage}%
            </p>
          </Card>

          <Card className="space-y-1 text-center bg-white border-[#EBE5DC]">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Questions</span>
            <p className="text-2xl md:text-3xl font-bold font-serif text-stone-900">
              {result.attempted_questions} <span className="text-sm font-normal text-stone-500">/ {result.total_questions}</span>
            </p>
          </Card>

          <Card className="space-y-1 text-center bg-white border-[#EBE5DC]">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Correct MCQs</span>
            <p className="text-2xl md:text-3xl font-bold font-serif text-emerald-800">
              {result.correct_mcq_count}
            </p>
          </Card>
        </div>

        {/* Evaluation Status Banner */}
        <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-700 print-card">
          <div className="space-y-0.5">
            <span className="font-semibold text-stone-900">Grading Status:</span>
            <p className="text-stone-500">
              {isEvaluated
                ? 'All multiple-choice and descriptive questions have been evaluated.'
                : 'Objective MCQs were graded automatically. Short-answer/descriptive responses are awaiting instructor manual evaluation.'}
            </p>
          </div>
          <Badge variant={isEvaluated ? 'success' : 'student'} className="self-start sm:self-auto whitespace-nowrap">
            {isEvaluated ? 'Fully Evaluated' : 'Evaluation In Progress'}
          </Badge>
        </div>

        {/* Question-by-Question Review Section */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-serif text-stone-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#C25E1A]" />
              Detailed Responses & Answer Breakdown
            </h2>
            <span className="text-xs text-stone-500">
              {result.questions.length} Question{result.questions.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-4">
            {result.questions.map((q, idx) => {
              const isMCQ = q.question_type === 'MCQ';
              const isShort = q.question_type === 'SHORT_ANSWER';
              const hasAnswered = isMCQ ? !!q.selected_option : !!q.answer_text;
              const marksDisplay = q.marks_awarded !== null && q.marks_awarded !== undefined
                ? `${q.marks_awarded} / ${q.max_marks}`
                : isShort
                ? 'Pending Review'
                : `0 / ${q.max_marks}`;

              return (
                <div
                  key={q.question_id}
                  className="p-5 bg-white rounded-2xl border border-[#EBE5DC] shadow-warm-sm space-y-3 page-break-avoid print-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#FAF7F2] border border-[#EBE5DC] text-stone-700 text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {isMCQ ? 'Multiple Choice' : 'Short Answer / Descriptive'}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-stone-900 block">
                        Marks: {marksDisplay}
                      </span>
                      <span className="text-[10px] text-stone-500">Max: {q.max_marks} Marks</span>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-stone-900">{q.question_text}</p>

                  {/* MCQ Detailed View */}
                  {isMCQ && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs space-y-1.5">
                        <div className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] flex items-center justify-between">
                          <span className="text-stone-600">Your Submitted Answer:</span>
                          <span className={`font-semibold flex items-center gap-1.5 ${q.is_correct ? 'text-emerald-800' : hasAnswered ? 'text-rose-700' : 'text-stone-500 italic'}`}>
                            {hasAnswered ? (
                              <>
                                {q.is_correct ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-rose-600" />}
                                {q.selected_option}
                              </>
                            ) : (
                              'Not Attempted'
                            )}
                          </span>
                        </div>

                        {q.correct_answer && (
                          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-emerald-900">
                            <span>Correct Answer:</span>
                            <span className="font-semibold">{q.correct_answer}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Short Answer Detailed View */}
                  {isShort && (
                    <div className="space-y-2 pt-1 text-xs">
                      <span className="text-stone-600 font-semibold block">Your Submitted Written Response:</span>
                      <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] text-stone-800 whitespace-pre-wrap leading-relaxed">
                        {q.answer_text && q.answer_text.trim() ? (
                          q.answer_text
                        ) : (
                          <span className="text-stone-400 italic">No response submitted for this question.</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-stone-500 pt-1">
                        <span>
                          Instructor Status:{' '}
                          <strong className={q.marks_awarded !== null ? 'text-emerald-800 font-semibold' : 'text-amber-800'}>
                            {q.marks_awarded !== null ? `Graded (${q.marks_awarded} / ${q.max_marks})` : 'Awaiting Faculty Grading'}
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}

                  {q.explanation && (
                    <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 text-xs text-amber-900">
                      <strong>Explanation:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Button (Hidden in Print) */}
        <div className="text-center pt-4 pb-8 no-print flex justify-center gap-3">
          <Button variant="outline" size="lg" onClick={handlePrint} className="gap-2 shadow-warm">
            <Printer className="w-4 h-4 text-[#C25E1A]" /> Print / Save as PDF
          </Button>
          <Link href="/student/dashboard">
            <Button variant="primary" size="lg" className="gap-2 shadow-warm">
              <BookOpen className="w-4 h-4" /> Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
