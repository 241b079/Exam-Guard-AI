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
    <div className="glass-panel p-5 rounded-2xl space-y-5 border border-slate-800">
      <div className="space-y-1 pb-3 border-b border-slate-800">
        <h3 className="text-sm font-bold text-slate-100">Question Navigator</h3>
        <p className="text-xs text-slate-400">Click a number to jump directly</p>
      </div>

      {/* Grid of question buttons */}
      <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1">
        {questions.map((q, idx) => {
          const status = getQuestionStatus(q.id);
          const isCurrent = idx === currentIndex;

          let btnStyle = 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500';
          if (status === 'answered') {
            btnStyle = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-semibold';
          } else if (status === 'marked') {
            btnStyle = 'bg-purple-500/25 text-purple-300 border-purple-500/50 font-semibold';
          }

          if (isCurrent) {
            btnStyle += ' ring-2 ring-brand-500 ring-offset-2 ring-offset-slate-900 border-brand-400 text-white font-bold';
          }

          return (
            <button
              key={q.id}
              onClick={() => onSelectQuestion(idx)}
              className={`relative h-10 rounded-xl border text-xs flex items-center justify-center transition-all ${btnStyle}`}
            >
              <span>{idx + 1}</span>
              {status === 'marked' && (
                <Flag className="w-2.5 h-2.5 text-purple-400 absolute top-1 right-1" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend & Stats */}
      <div className="space-y-2 pt-3 border-t border-slate-800 text-xs">
        <div className="flex items-center justify-between text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500" />
            <span>Answered</span>
          </div>
          <span className="font-bold text-emerald-400">{answeredCount}</span>
        </div>

        <div className="flex items-center justify-between text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-500/30 border border-purple-500" />
            <span>Marked for Review</span>
          </div>
          <span className="font-bold text-purple-300">{markedCount}</span>
        </div>

        <div className="flex items-center justify-between text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate-800 border border-slate-700" />
            <span>Unanswered</span>
          </div>
          <span className="font-bold text-slate-400">{unansweredCount}</span>
        </div>
      </div>
    </div>
  );
};
