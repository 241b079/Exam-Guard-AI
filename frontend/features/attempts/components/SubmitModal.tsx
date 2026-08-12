'use client';

import React from 'react';
import { AlertCircle, CheckCircle, Flag, HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Question } from '@/features/questions/types';
import { Answer } from '../types';

interface SubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitConfirm: () => void;
  questions: Question[];
  answers: Record<string, Answer>;
  isLoading?: boolean;
}

export const SubmitModal: React.FC<SubmitModalProps> = ({
  isOpen,
  onClose,
  onSubmitConfirm,
  questions,
  answers,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  let answeredCount = 0;
  let markedCount = 0;
  let unansweredCount = 0;

  questions.forEach((q) => {
    const ans = answers[q.id];
    const isAns = Boolean(
      (ans?.selected_option && ans.selected_option.trim()) ||
      (ans?.answer_text && ans.answer_text.trim())
    );

    if (ans?.is_marked_for_review) markedCount++;
    if (isAns) answeredCount++;
    else unansweredCount++;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-bold text-white">Submit Exam Confirmation</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-300">
          Are you sure you want to submit your exam? Once submitted, you will not be able to change your answers.
        </p>

        {/* Summary Breakdown */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
            <span className="text-[11px] text-emerald-400 uppercase font-semibold block">Answered</span>
            <span className="text-lg font-extrabold text-emerald-300">{answeredCount} / {questions.length}</span>
          </div>

          <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl space-y-1">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Unanswered</span>
            <span className="text-lg font-extrabold text-slate-300">{unansweredCount}</span>
          </div>

          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl space-y-1">
            <span className="text-[11px] text-purple-300 uppercase font-semibold block">Review</span>
            <span className="text-lg font-extrabold text-purple-300">{markedCount}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Continue Exam
          </Button>
          <Button variant="primary" onClick={onSubmitConfirm} isLoading={isLoading}>
            Submit Exam
          </Button>
        </div>
      </div>
    </div>
  );
};
