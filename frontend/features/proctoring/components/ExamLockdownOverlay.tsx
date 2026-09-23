'use client';

import React from 'react';
import { Maximize, ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ExamLockdownOverlayProps {
  isOpen: boolean;
  violationCount: number;
  onReturnToFullscreen: () => void;
}

export const ExamLockdownOverlay: React.FC<ExamLockdownOverlayProps> = ({
  isOpen,
  violationCount,
  onReturnToFullscreen,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border-2 border-rose-300 text-center space-y-6 animate-scaleIn">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
          <ShieldAlert className="w-9 h-9" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold font-serif text-stone-900">
            Fullscreen Mode Exited
          </h2>
          <p className="text-sm text-stone-600 leading-relaxed">
            Fullscreen mode is required to maintain academic integrity during this exam. This action has been recorded as an exam violation.
          </p>
        </div>

        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900 font-medium">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            Integrity Violations Logged:
          </span>
          <span className="font-bold px-2.5 py-1 bg-amber-200/80 rounded-full text-amber-950 text-xs">
            {violationCount} {violationCount === 1 ? 'Violation' : 'Violations'}
          </span>
        </div>

        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            onClick={onReturnToFullscreen}
            className="w-full gap-2 text-base font-semibold shadow-warm bg-[#C25E1A] hover:bg-[#A34B13] text-white py-3 rounded-2xl"
          >
            <Maximize className="w-5 h-5" /> Return to Fullscreen
          </Button>
        </div>

        <p className="text-[11px] text-stone-600">
          Clicking above will immediately restore your full-screen exam environment.
        </p>
      </div>
    </div>
  );
};

interface ExamIntegrityIndicatorProps {
  isFullscreen: boolean;
  violationCount: number;
}

export const ExamIntegrityIndicator: React.FC<ExamIntegrityIndicatorProps> = ({
  isFullscreen,
  violationCount,
}) => {
  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#FAF7F2] border border-[#EBE5DC] text-xs shadow-sm">
      <div className="flex items-center gap-1.5 font-semibold text-stone-700">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span className="hidden sm:inline">Secure Mode:</span>
        <span className={isFullscreen ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
          {isFullscreen ? 'Fullscreen Active' : 'Windowed'}
        </span>
      </div>

      <span className="text-stone-300">|</span>

      <div className="flex items-center gap-1">
        <span className="text-stone-500">Violations:</span>
        <span
          className={`font-bold px-1.5 py-0.5 rounded-md text-[11px] ${
            violationCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-stone-200 text-stone-700'
          }`}
        >
          {violationCount}
        </span>
      </div>
    </div>
  );
};

interface ExamViolationToastProps {
  message: string | null;
}

export const ExamViolationToast: React.FC<ExamViolationToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="fixed top-20 right-6 z-50 animate-bounce max-w-sm w-full bg-stone-900/95 text-white border border-stone-700 rounded-2xl p-4 shadow-xl backdrop-blur-md flex items-start gap-3">
      <div className="p-1.5 bg-rose-500/20 text-rose-400 rounded-xl flex-shrink-0 mt-0.5">
        <AlertTriangle className="w-4 h-4" />
      </div>
      <div className="space-y-0.5 flex-1">
        <p className="text-xs font-bold text-rose-300 uppercase tracking-wider">Exam Integrity Warning</p>
        <p className="text-xs text-stone-200 leading-snug">{message}</p>
      </div>
    </div>
  );
};
