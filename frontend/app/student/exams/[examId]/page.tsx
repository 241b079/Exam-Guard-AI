'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Flag, Send, CheckCircle2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/shared/Loading';
import { Exam, examService } from '@/features/exams';
import { Question, useQuestions } from '@/features/questions';
import {
  ExamAttempt,
  Answer,
  attemptService,
  ExamTimer,
  QuestionNavigator,
  SubmitModal
} from '@/features/attempts';

export default function StudentExaminationPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.examId as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const { questions, isLoading: isQLoading } = useQuestions(examId);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answersMap, setAnswersMap] = useState<Record<string, Answer>>({});
  
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [answerText, setAnswerText] = useState<string>('');
  const [isMarkedReview, setIsMarkedReview] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Exam and Attempt
  useEffect(() => {
    async function loadTestData() {
      setIsLoading(true);
      setError(null);
      try {
        const [exData, attData] = await Promise.all([
          examService.getExamById(examId),
          attemptService.startOrResumeAttempt(examId),
        ]);
        setExam(exData);
        setAttempt(attData);

        // Map initial answers
        const map: Record<string, Answer> = {};
        (attData.answers || []).forEach((a) => {
          map[a.question_id] = a;
        });
        setAnswersMap(map);

        if (attData.status === 'SUBMITTED') {
          router.push(`/student/exams/${examId}/result`);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to initialize exam session');
      } finally {
        setIsLoading(false);
      }
    }

    if (examId) loadTestData();
  }, [examId, router]);

  const currentQuestion: Question | undefined = questions[currentIndex];

  // Sync inputs when current question changes
  useEffect(() => {
    if (currentQuestion) {
      const existingAns = answersMap[currentQuestion.id];
      setSelectedOption(existingAns?.selected_option || '');
      setAnswerText(existingAns?.answer_text || '');
      setIsMarkedReview(existingAns?.is_marked_for_review || false);
    }
  }, [currentIndex, currentQuestion, answersMap]);

  // Save current answer to backend
  const saveCurrentAnswer = useCallback(
    async (optOverride?: string, textOverride?: string, reviewOverride?: boolean) => {
      if (!attempt || !currentQuestion) return;

      const opt = optOverride !== undefined ? optOverride : selectedOption;
      const txt = textOverride !== undefined ? textOverride : answerText;
      const rev = reviewOverride !== undefined ? reviewOverride : isMarkedReview;

      setIsSaving(true);
      try {
        const saved = await attemptService.saveAnswer(attempt.id, {
          question_id: currentQuestion.id,
          selected_option: opt,
          answer_text: txt,
          is_marked_for_review: rev,
        });

        setAnswersMap((prev) => ({
          ...prev,
          [currentQuestion.id]: saved,
        }));
      } catch {
        // Silently handle quick save glitches
      } finally {
        setIsSaving(false);
      }
    },
    [attempt, currentQuestion, selectedOption, answerText, isMarkedReview]
  );

  const handleNext = async () => {
    await saveCurrentAnswer();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = async () => {
    await saveCurrentAnswer();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSelectQuestion = async (index: number) => {
    await saveCurrentAnswer();
    setCurrentIndex(index);
  };

  const handleToggleMarkReview = async () => {
    const nextVal = !isMarkedReview;
    setIsMarkedReview(nextVal);
    await saveCurrentAnswer(selectedOption, answerText, nextVal);
  };

  const handleOptionSelect = async (opt: string) => {
    setSelectedOption(opt);
    await saveCurrentAnswer(opt, answerText, isMarkedReview);
  };

  const handleTextChange = (txt: string) => {
    setAnswerText(txt);
  };

  const handleFinalSubmit = async () => {
    if (!attempt) return;
    setIsSubmitting(true);
    try {
      await saveCurrentAnswer();
      await attemptService.submitAttempt(attempt.id);
      router.push(`/student/exams/${examId}/result`);
    } catch (err: any) {
      alert(err.message || 'Failed to submit exam');
      setIsSubmitting(false);
    }
  };

  const handleTimeExpired = useCallback(async () => {
    if (!attempt || attempt.status === 'SUBMITTED') return;
    try {
      await attemptService.submitAttempt(attempt.id);
      router.push(`/student/exams/${examId}/result`);
    } catch {
      router.push(`/student/exams/${examId}/result`);
    }
  }, [attempt, examId, router]);

  if (isLoading || isQLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loading message="Starting examination session..." />
      </div>
    );
  }

  if (error || !exam || !attempt) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="max-w-md mx-auto p-6 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-center space-y-4">
          <p>{error || 'Exam session unavailable'}</p>
          <Button variant="secondary" onClick={() => router.push('/student/exams')}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col selection:bg-brand-500 selection:text-white">
      {/* Top Header Bar */}
      <header className="h-16 glass-panel border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/30">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">{exam.title}</h1>
            <p className="text-[10px] text-slate-400">Question {currentIndex + 1} of {questions.length}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ExamTimer
            initialSeconds={attempt.time_remaining_seconds}
            onTimeExpired={handleTimeExpired}
            displayCountdown={exam.display_countdown}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsSubmitModalOpen(true)}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold"
          >
            <Send className="w-4 h-4" /> Submit Exam
          </Button>
        </div>
      </header>

      {/* Main Examination Grid Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left/Center: Current Question Card */}
        <div className="lg:col-span-3 flex flex-col justify-between space-y-6">
          {currentQuestion && (
            <Card className="flex-1 p-6 md:p-8 space-y-6 flex flex-col justify-between">
              <div className="space-y-6">
                {/* Question Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Question {currentIndex + 1}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-500/10 text-brand-400 border border-brand-500/20">
                      {currentQuestion.question_type}
                    </span>
                    <span className="text-xs font-semibold text-purple-400">
                      [{currentQuestion.marks} Marks]
                    </span>
                  </div>

                  <button
                    onClick={handleToggleMarkReview}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      isMarkedReview
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>{isMarkedReview ? 'Marked for Review' : 'Mark for Review'}</span>
                  </button>
                </div>

                {/* Question Text */}
                <h2 className="text-base md:text-lg font-bold text-slate-100 leading-relaxed">
                  {currentQuestion.question_text}
                </h2>

                {/* MCQ Choices */}
                {currentQuestion.question_type === 'MCQ' && (
                  <div className="space-y-3 pt-2">
                    {(currentQuestion.options || []).map((opt, i) => {
                      const isSelected = selectedOption === opt;
                      return (
                        <label
                          key={i}
                          onClick={() => handleOptionSelect(opt)}
                          className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-brand-500/15 border-brand-500/60 text-white shadow-md'
                              : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            isSelected ? 'border-brand-400 bg-brand-500 text-white' : 'border-slate-600'
                          }`}>
                            {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <span className="text-xs font-bold text-slate-400 w-5">
                            {String.fromCharCode(65 + i)}:
                          </span>
                          <span className="text-sm font-medium">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Short Answer Input */}
                {currentQuestion.question_type === 'SHORT_ANSWER' && (
                  <div className="space-y-2 pt-2">
                    <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider">
                      Type your answer below:
                    </label>
                    <textarea
                      className="w-full px-4 py-3 bg-slate-900/90 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 min-h-[160px]"
                      placeholder="Type your response here..."
                      value={answerText}
                      onChange={(e) => handleTextChange(e.target.value)}
                      onBlur={() => saveCurrentAnswer()}
                    />
                  </div>
                )}
              </div>

              {/* Card Footer Navigation Buttons */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-800">
                <Button
                  variant="secondary"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="gap-2 text-xs"
                >
                  <ArrowLeft className="w-4 h-4" /> Previous
                </Button>

                <div className="flex items-center gap-3">
                  {currentIndex < questions.length - 1 ? (
                    <Button variant="primary" onClick={handleNext} className="gap-2 text-xs">
                      Next <ArrowRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => setIsSubmitModalOpen(true)}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-xs"
                    >
                      Review & Submit <Send className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right Sidebar: Question Navigator */}
        <div className="lg:col-span-1">
          <QuestionNavigator
            questions={questions}
            answers={answersMap}
            currentIndex={currentIndex}
            onSelectQuestion={handleSelectQuestion}
          />
        </div>
      </div>

      {/* Submission Confirmation Modal */}
      <SubmitModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSubmitConfirm={handleFinalSubmit}
        questions={questions}
        answers={answersMap}
        isLoading={isSubmitting}
      />
    </div>
  );
}
