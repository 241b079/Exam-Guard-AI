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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm-lg space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[#EBE5DC] pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-[#C25E1A]" />
            <h2 className="text-lg font-bold font-serif text-stone-900">Submit Exam Confirmation</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-[#FAF7F2]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-stone-600">
          Are you sure you want to submit your exam? Once submitted, you will not be able to change your answers.
        </p>

        {/* Summary Breakdown */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 bg-[#DEF7EC] border border-[#BCF0DA] rounded-2xl space-y-1">
            <span className="text-[11px] text-emerald-800 uppercase font-semibold block">Answered</span>
            <span className="text-lg font-extrabold text-emerald-900">{answeredCount} / {questions.length}</span>
          </div>

          <div className="p-3 bg-[#FAF7F2] border border-[#E3DCD2] rounded-2xl space-y-1">
            <span className="text-[11px] text-stone-500 uppercase font-semibold block">Unanswered</span>
            <span className="text-lg font-extrabold text-stone-700">{unansweredCount}</span>
          </div>

          <div className="p-3 bg-[#FEF3C7] border border-[#FDE68A] rounded-2xl space-y-1">
            <span className="text-[11px] text-amber-800 uppercase font-semibold block">Review</span>
            <span className="text-lg font-extrabold text-amber-900">{markedCount}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EBE5DC]">
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

