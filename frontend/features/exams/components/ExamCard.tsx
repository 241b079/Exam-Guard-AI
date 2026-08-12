'use client';

import React from 'react';
import Link from 'next/link';
import { Clock, HelpCircle, Award, Settings, Trash2, Globe, Lock } from 'lucide-react';
import { Exam } from '../types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface ExamCardProps {
  exam: Exam;
  isFaculty?: boolean;
  onDelete?: (id: string) => void;
}

export const ExamCard: React.FC<ExamCardProps> = ({ exam, isFaculty = false, onDelete }) => {
  const statusBadgeVariant = exam.status === 'PUBLISHED' ? 'success' : exam.status === 'DRAFT' ? 'faculty' : 'info';

  return (
    <div className="glass-card p-6 rounded-2xl border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col justify-between space-y-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-100 tracking-tight leading-snug line-clamp-1">
            {exam.title}
          </h3>
          <Badge variant={statusBadgeVariant}>{exam.status}</Badge>
        </div>

        {exam.description && (
          <p className="text-xs text-slate-400 line-clamp-2">{exam.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 pt-2 border-t border-slate-800/60">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-brand-400" />
            <span>{exam.question_count} Questions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{exam.duration_minutes} Mins</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-purple-400" />
            <span>{exam.total_marks} Marks</span>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
        {isFaculty ? (
          <div className="flex items-center gap-2 w-full">
            <Link href={`/faculty/exams/${exam.id}`} className="flex-1">
              <Button variant="secondary" size="sm" className="w-full text-xs">
                Manage
              </Button>
            </Link>
            <Link href={`/faculty/exams/${exam.id}/questions`}>
              <Button variant="outline" size="sm" className="text-xs">
                Questions
              </Button>
            </Link>
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(exam.id)}
                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-2"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ) : (
          <Link href={`/student/exams/${exam.id}/instructions`} className="w-full">
            <Button variant="primary" size="md" className="w-full text-xs font-semibold">
              Start Exam
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
};
