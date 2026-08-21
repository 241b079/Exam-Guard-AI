'use client';

import React from 'react';
import { Flag, CheckCircle, HelpCircle } from 'lucide-react';
import { Question } from '@/features/questions/types';
import { Answer } from '../types';

interface QuestionNavigatorProps {
  questions: Question[];
  answers: Record<string, Answer>;
  currentIndex: number;
  onSelectQuestion: (index: number) => void;
}

export const QuestionNavigator: React.FC<QuestionNavigatorProps> = ({
  questions,
  answers,
  currentIndex,
  onSelectQuestion,
}) => {
  const getQuestionStatus = (questionId: string) => {
    const ans = answers[questionId];
    if (!ans) return 'unanswered';

    const isAnswered = Boolean(
      (ans.selected_option && ans.selected_option.trim()) ||
      (ans.answer_text && ans.answer_text.trim())
    );

    if (ans.is_marked_for_review) return 'marked';
    if (isAnswered) return 'answered';
    return 'unanswered';
  };

  let answeredCount = 0;
  let markedCount = 0;
  let unansweredCount = 0;

  questions.forEach((q) => {
    const st = getQuestionStatus(q.id);
    if (st === 'answered') answeredCount++;
    else if (st === 'marked') markedCount++;
    else unansweredCount++;
  });

  return (
    <div className="bg-white p-5 rounded-3xl space-y-5 border border-[#EBE5DC] shadow-warm">
      <div className="space-y-1 pb-3 border-b border-[#EBE5DC]">
        <h3 className="text-sm font-bold font-serif text-stone-900">Question Navigator</h3>
        <p className="text-xs text-stone-500">Click a number to jump directly</p>
      </div>

      {/* Grid of question buttons */}
      <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1">
        {questions.map((q, idx) => {
          const status = getQuestionStatus(q.id);
          const isCurrent = idx === currentIndex;

          let btnStyle = 'bg-[#FAF7F2] text-stone-600 border-[#E3DCD2] hover:border-[#D0C5B5]';
          if (status === 'answered') {
            btnStyle = 'bg-[#DEF7EC] text-[#03543F] border-[#BCF0DA] font-semibold';
          } else if (status === 'marked') {
            btnStyle = 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A] font-semibold';
          }

          if (isCurrent) {
            btnStyle += ' ring-2 ring-[#C25E1A] ring-offset-2 ring-offset-[#FAF7F2] border-[#C25E1A] font-bold';
          }

          return (
            <button
              key={q.id}
              onClick={() => onSelectQuestion(idx)}
              className={`relative h-10 rounded-xl border text-xs flex items-center justify-center transition-all ${btnStyle}`}
            >
              <span>{idx + 1}</span>
              {status === 'marked' && (
                <Flag className="w-2.5 h-2.5 text-amber-600 absolute top-1 right-1" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend & Stats */}
      <div className="space-y-2 pt-3 border-t border-[#EBE5DC] text-xs">
        <div className="flex items-center justify-between text-stone-700">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#DEF7EC] border border-[#BCF0DA]" />
            <span>Answered</span>
          </div>
          <span className="font-bold text-emerald-800">{answeredCount}</span>
        </div>

        <div className="flex items-center justify-between text-stone-700">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#FEF3C7] border border-[#FDE68A]" />
            <span>Marked for Review</span>
          </div>
          <span className="font-bold text-amber-800">{markedCount}</span>
        </div>

        <div className="flex items-center justify-between text-stone-700">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#FAF7F2] border border-[#E3DCD2]" />
            <span>Unanswered</span>
          </div>
          <span className="font-bold text-stone-500">{unansweredCount}</span>
        </div>
      </div>
    </div>
  );
};

