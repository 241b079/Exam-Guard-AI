'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ShieldCheck, Clock, HelpCircle, Award, ArrowLeft, Play, ArrowRight, UserCheck, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Exam, examService } from '@/features/exams';
import { attemptService } from '@/features/attempts';
import { IdentityVerificationStep, identityService } from '@/features/identity';
import { ExamMediaSetupStep } from '@/features/proctoring';
import { Loading } from '@/components/shared/Loading';

export default function StudentExamInstructionsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.examId as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Instructions, Step 2: Identity Verification, Step 3: Media Setup
  const [activeStep, setActiveStep] = useState<'instructions' | 'verification' | 'media-setup'>('instructions');
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    if (examId) {
      Promise.all([
        examService.getExamById(examId),
        identityService.getVerificationStatus(examId).catch(() => null),
      ])
        .then(([examData, verStatus]) => {
          setExam(examData);
          if (verStatus?.is_verified) {
            setIsVerified(true);
          }
        })
        .catch((err) => setError(err.message || 'Failed to load exam details'))
        .finally(() => setIsLoading(false));
    }
  }, [examId]);

  const requestBrowserFullscreen = async (): Promise<boolean> => {
    try {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
      return true;
    } catch (err) {
      console.warn('Fullscreen entry rejected or blocked:', err);
      return false;
    }
  };

  const handleStartExam = async () => {
    setIsStarting(true);
    setError(null);

    // Request fullscreen from direct user gesture
    const entered = await requestBrowserFullscreen();
    if (!entered) {
      setError('Fullscreen mode is required to start this exam. Please allow fullscreen in your browser and try again.');
      setIsStarting(false);
      return;
    }

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

  if (!exam) {
    return (
      <DashboardLayout title="Exam Instructions">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 shadow-warm max-w-2xl mx-auto space-y-4">
          <p className="font-semibold">{error || 'Exam not found'}</p>
          <Button variant="secondary" onClick={() => router.push('/student/exams')}>
            Return to Exams
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Exam Onboarding — ${exam.title}`}>

      <div className="space-y-6 max-w-4xl mx-auto">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-4 text-rose-800 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleStartExam} disabled={isStarting}>
              Try Again
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">

          <Link href="/student/exams" className="inline-flex items-center gap-2 text-xs text-stone-500 hover:text-stone-900 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Available Exams
          </Link>

          {/* Stepper Header Badges */}
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setActiveStep('instructions')}
              className={`px-3 py-1 rounded-full font-semibold transition-all ${
                activeStep === 'instructions'
                  ? 'bg-[#C25E1A] text-white shadow-sm'
                  : 'bg-[#FAF7F2] text-stone-600 border border-[#EBE5DC]'
              }`}
            >
              1. Guidelines
            </button>
            <span className="text-stone-300">/</span>
            <button
              onClick={() => setActiveStep('verification')}
              className={`px-3 py-1 rounded-full font-semibold transition-all flex items-center gap-1.5 ${
                activeStep === 'verification'
                  ? 'bg-[#C25E1A] text-white shadow-sm'
                  : isVerified
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-[#FAF7F2] text-stone-600 border border-[#EBE5DC]'
              }`}
            >
              {isVerified && <UserCheck className="w-3.5 h-3.5 text-emerald-600" />}
              2. Identity Check {isVerified && '(Verified)'}
            </button>
            <span className="text-stone-300">/</span>
            <button
              onClick={() => isVerified && setActiveStep('media-setup')}
              disabled={!isVerified}
              className={`px-3 py-1 rounded-full font-semibold transition-all ${
                activeStep === 'media-setup'
                  ? 'bg-[#C25E1A] text-white shadow-sm'
                  : 'bg-[#FAF7F2] text-stone-600 border border-[#EBE5DC] disabled:opacity-50'
              }`}
            >
              3. Media Setup
            </button>
          </div>
        </div>

        {/* STEP 1: INSTRUCTIONS */}
        {activeStep === 'instructions' && (
          <div className="space-y-6">
            {/* Title Header */}
            <div className="p-6 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold font-serif text-stone-900">{exam.title}</h1>
                  <p className="text-xs text-stone-500">Review guidelines before proceeding to live identity verification.</p>
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
                Examination Rules & Identity Guidelines
              </h3>
              <ul className="space-y-3 text-sm text-stone-700 list-disc list-inside">
                <li>A live webcam photo verification is required before starting this exam.</li>
                <li>Your live face will be matched with your registered profile photo on record.</li>
                <li>Ensure you are seated in a well-lit area and face the camera directly.</li>
                <li>Your answers are saved automatically as you navigate between questions.</li>
                <li>Ensure you submit the exam before the countdown timer expires.</li>
              </ul>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[#EBE5DC]">
              <Link href="/student/exams">
                <Button variant="secondary">Back to Exams</Button>
              </Link>
              <Button
                variant="primary"
                size="lg"
                onClick={() => setActiveStep('verification')}
                className="gap-2 text-base shadow-warm"
              >
                Proceed to Identity Check <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: IDENTITY VERIFICATION */}
        {activeStep === 'verification' && (
          <div className="space-y-6">
            <IdentityVerificationStep
              examId={examId}
              onVerified={() => {
                setIsVerified(true);
                setActiveStep('media-setup');
              }}
              onCancel={() => setActiveStep('instructions')}
            />
          </div>
        )}

        {/* STEP 3: MEDIA SETUP & MONITORING PERMISSIONS */}
        {activeStep === 'media-setup' && (
          <div className="space-y-6">
            <ExamMediaSetupStep
              examId={examId}
              onContinue={() => {
                handleStartExam();
              }}
              onBack={() => setActiveStep('verification')}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

