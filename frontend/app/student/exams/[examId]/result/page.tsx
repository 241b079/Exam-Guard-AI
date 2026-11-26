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
  RefreshCw,
  ShieldAlert,
  History,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { attemptService, AttemptReviewResponse, StudentAppealModal } from '@/features/attempts';
import { Loading } from '@/components/shared/Loading';

export default function StudentExamResultPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const examId = params.examId as string;
  const attemptIdParam = searchParams.get('attemptId') || undefined;

  const [result, setResult] = useState<AttemptReviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);

  const loadResult = async (retryCount = 0) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await attemptService.getMyExamResult(examId, attemptIdParam);
      setResult(data);
    } catch (err: any) {
      if (retryCount < 2) {
        setTimeout(() => loadResult(retryCount + 1), 1000);
      } else {
        setError(err.message || 'Failed to load examination result');
      }
    } finally {
      if (retryCount === 0) {
        setIsLoading(false);
      }
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
            <div className="pt-2 flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => loadResult(0)} className="text-xs gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Try Again
              </Button>
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

  const isDisqualified = result.integrity_status === 'DISQUALIFIED' || result.publication_status === 'DISQUALIFIED';
  const isEvaluated = result.evaluation_status === 'EVALUATED';
  const isPublished = result.publication_status === 'PUBLISHED' && !isDisqualified;
  const percentage = isDisqualified
    ? 0
    : result.percentage !== null && result.percentage !== undefined
    ? result.percentage
    : (result.total_score !== null && result.total_score !== undefined && result.max_possible_score > 0
        ? Math.round((result.total_score / result.max_possible_score) * 100)
        : null);

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
            {isPublished && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-2 text-xs font-semibold shadow-warm-sm hover:bg-[#FAF7F2]"
              >
                <Printer className="w-4 h-4 text-[#C25E1A]" /> Print / Save as PDF
              </Button>
            )}
            <Link href="/student/history">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <History className="w-3.5 h-3.5 text-[#C25E1A]" /> Exam History
              </Button>
            </Link>
            <Link href="/student/dashboard">
              <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
                <BookOpen className="w-4 h-4" /> Dashboard
              </Button>
            </Link>
          </div>
        </div>

        {/* Post-Submission Status Notification Banner */}
        {result.student_status_message && (
          <div
            className={`p-5 rounded-3xl border shadow-warm flex items-start gap-3.5 ${
              isDisqualified
                ? 'bg-rose-50 border-rose-200 text-rose-950'
                : isPublished
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : result.publication_status === 'HELD'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-stone-50 border-stone-200 text-stone-900'
            }`}
          >
            <div className="p-2 rounded-2xl bg-white/80 shadow-warm-sm flex-shrink-0">
              {isDisqualified ? (
                <ShieldAlert className="w-5 h-5 text-rose-600" />
              ) : isPublished ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <Clock className="w-5 h-5 text-stone-600" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isDisqualified
                    ? 'Examination Disqualified'
                    : isPublished
                    ? 'Official Result Released'
                    : 'Examination Processing Notice'}
                </span>
                <Badge
                  variant={isDisqualified ? 'danger' : isPublished ? 'success' : 'outline'}
                  className="text-[10px]"
                >
                  {isDisqualified ? 'DISQUALIFIED' : result.publication_status || 'AWAITING_PUBLICATION'}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-stone-700 font-medium">
                {result.student_status_message}
              </p>
            </div>
          </div>
        )}

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
                <p>Status: {isDisqualified ? 'DISQUALIFIED' : result.status}</p>
              </div>
            </div>
          </div>

          <div
            className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto shadow-warm-sm no-print ${
              isDisqualified
                ? 'bg-rose-100 border-rose-200 text-rose-700'
                : 'bg-[#DEF7EC] border-[#BCF0DA] text-[#03543F]'
            }`}
          >
            {isDisqualified ? (
              <ShieldAlert className="w-10 h-10" />
            ) : (
              <CheckCircle2 className="w-10 h-10" />
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <Badge variant={isDisqualified ? 'danger' : result.status === 'SUBMITTED' ? 'success' : 'faculty'}>
                {isDisqualified ? 'Attempt Disqualified' : result.status === 'SUBMITTED' ? 'Exam Completed' : result.status}
              </Badge>
              <Badge variant={isDisqualified ? 'danger' : isPublished ? 'success' : 'student'}>
                {isDisqualified ? 'Grade 0 Finalized' : isPublished ? 'Results Published' : 'Publication Pending'}
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

        {/* Score Breakdown Grid: Controlled display based on publication status & disqualification */}
        {isDisqualified ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print-card">
            <Card className="space-y-1 text-center bg-rose-50/60 border-rose-200 p-5">
              <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Finalized Grade</span>
              <p className="text-3xl font-bold font-serif text-rose-700">
                0 <span className="text-sm font-normal text-stone-500">/ {result.max_possible_score || 0}</span>
              </p>
              <p className="text-[11px] text-rose-600 font-semibold uppercase">Disqualified (0%)</p>
            </Card>

            <Card className="space-y-1 text-center bg-white border-[#EBE5DC] p-5">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Responses Status</span>
              <p className="text-xl font-bold text-stone-900">Voided</p>
              <p className="text-[11px] text-stone-500">{result.attempted_questions} questions recorded</p>
            </Card>

            <Card className="space-y-1 text-center bg-rose-50/40 border-rose-200 p-5">
              <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Academic Integrity Status</span>
              <p className="text-lg font-bold text-rose-800">Policy Infraction</p>
              <p className="text-[11px] text-rose-600">Disqualification confirmed by faculty</p>
            </Card>
          </div>
        ) : isPublished ? (
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
                {result.correct_mcq_count ?? 0}
              </p>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print-card">
            <Card className="space-y-1 text-center bg-white border-[#EBE5DC] p-5">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Submission Record</span>
              <p className="text-lg font-bold text-stone-900">Recorded Securely</p>
              <p className="text-[11px] text-stone-500">Attempt #{result.attempt_number} captured</p>
            </Card>

            <Card className="space-y-1 text-center bg-white border-[#EBE5DC] p-5">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Questions Attempted</span>
              <p className="text-2xl font-bold text-stone-900">
                {result.attempted_questions} <span className="text-sm font-normal text-stone-500">/ {result.total_questions}</span>
              </p>
              <p className="text-[11px] text-stone-500">All responses saved</p>
            </Card>

            <Card className="space-y-1 text-center bg-amber-50/60 border-amber-200 p-5">
              <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Evaluated Marks</span>
              <p className="text-lg font-bold text-amber-900">Withheld Pending Review</p>
              <p className="text-[11px] text-amber-700">Official marks will be published after authorization</p>
            </Card>
          </div>
        )}

        {/* Evaluation Status Banner */}
        <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-700 print-card">
          <div className="space-y-0.5">
            <span className="font-semibold text-stone-900">Academic Review & Publication:</span>
            <p className="text-stone-500">
              {isDisqualified
                ? 'This candidate attempt was formally disqualified by course faculty for examination misconduct.'
                : isPublished
                ? 'All questions and academic integrity checks have been validated and released by course faculty.'
                : 'Responses and automated evaluations are stored securely. Faculty authorization is required before individual marks are published.'}
            </p>
          </div>
          <Badge
            variant={isDisqualified ? 'danger' : isPublished ? 'success' : 'student'}
            className="self-start sm:self-auto whitespace-nowrap"
          >
            {isDisqualified ? 'DISQUALIFIED' : isPublished ? 'Results Published' : 'Withheld for Review'}
          </Badge>
        </div>

        {/* Question-by-Question Review Section */}
        {isDisqualified ? (
          <div className="space-y-4">
            {/* Formal Disqualification Finding & Statement card */}
            <div className="p-6 rounded-3xl bg-rose-50 border border-rose-200 shadow-warm space-y-4 print-card text-left">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                  Faculty Adjudication & Disqualification Reason
                </div>
                {result.appeal_status && result.appeal_status !== 'NONE' && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    Appeal: {result.appeal_status}
                  </span>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-white/90 border border-rose-100 text-xs text-rose-950 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-rose-700 tracking-wider block">
                  Official Sanction Finding Recorded by Faculty:
                </span>
                <p className="font-semibold text-sm leading-relaxed">
                  "{result.disqualification_reason || 'Academic integrity policy violation identified during proctoring review.'}"
                </p>
                {result.disqualification_evidence && (
                  <p className="text-[11px] text-stone-600 pt-1 border-t border-rose-100">
                    Evidence Summary: {result.disqualification_evidence}
                  </p>
                )}
              </div>

              {result.appeal_reason && (
                <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-stone-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">
                    Your Submitted Appeal Statement:
                  </span>
                  <p className="italic">"{result.appeal_reason}"</p>
                  {result.appeal_submitted_at && (
                    <span className="text-[10px] text-stone-500 block">
                      Submitted on: {new Date(result.appeal_submitted_at).toLocaleString()}
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-[11px] text-rose-800 max-w-md">
                  In accordance with institutional academic regulations, you may submit a formal request for review / appeal if you believe this sanction was imposed in error.
                </p>
                {result.is_appealable && (!result.appeal_status || result.appeal_status === 'NONE') && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsAppealModalOpen(true)}
                    className="gap-2 text-xs bg-rose-700 hover:bg-rose-800 text-white"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" /> Request Review / Submit Appeal
                  </Button>
                )}
              </div>
            </div>

            <div className="p-8 bg-white rounded-3xl border border-rose-200 text-center space-y-3 shadow-warm print-card">
              <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Question Keys & Responses Withheld</h3>
              <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
                Per university examination regulations, question keys, evaluation breakdowns, and candidate responses are permanently suppressed for disqualified attempts.
              </p>
            </div>
          </div>
        ) : !isPublished ? (
          <div className="p-8 bg-white rounded-3xl border border-[#EBE5DC] text-center space-y-3 shadow-warm print-card">
            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold font-serif text-stone-900">
              Detailed Responses & Answer Breakdown Withheld
            </h3>
            <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
              Your responses have been securely recorded. Question details, submitted answers, and answer keys are hidden while your examination is pending faculty review and publication.
            </p>
          </div>
        ) : (
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
              const marksDisplay = !isPublished
                ? 'Kept Securely'
                : q.marks_awarded !== null && q.marks_awarded !== undefined
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
        )}

        {/* Action Button (Hidden in Print) */}
        <div className="text-center pt-4 pb-8 no-print flex justify-center gap-3">
          {isPublished && (
            <Button variant="outline" size="lg" onClick={handlePrint} className="gap-2 shadow-warm">
              <Printer className="w-4 h-4 text-[#C25E1A]" /> Print / Save as PDF
            </Button>
          )}
          <Link href="/student/dashboard">
            <Button variant="primary" size="lg" className="gap-2 shadow-warm">
              <BookOpen className="w-4 h-4" /> Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* Appeal Submission Modal */}
      <StudentAppealModal
        isOpen={isAppealModalOpen}
        onClose={() => setIsAppealModalOpen(false)}
        attempt={result ? {
          attempt_id: result.attempt_id,
          exam_title: result.exam_title,
          attempt_number: result.attempt_number,
          disqualification_reason: result.disqualification_reason,
          disqualification_evidence: result.disqualification_evidence,
          appeal_status: result.appeal_status,
          appeal_reason: result.appeal_reason,
        } : null}
        onAppealSubmitted={() => {
          attemptService
            .getMyExamResult(examId, attemptIdParam)
            .then((data) => setResult(data))
            .catch(() => {});
        }}
      />
    </DashboardLayout>
  );
}
