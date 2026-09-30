'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock, HelpCircle, Award, Settings, Trash2, Play, RefreshCw, CheckCircle2, AlertOctagon } from 'lucide-react';
import { Exam } from '../types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StudentExamStatusResponse, attemptService } from '@/features/attempts';

interface ExamCardProps {
  exam: Exam;
  isFaculty?: boolean;
  onDelete?: (id: string) => void;
}

export const ExamCard: React.FC<ExamCardProps> = ({ exam, isFaculty = false, onDelete }) => {
  const [studentStatus, setStudentStatus] = useState<StudentExamStatusResponse | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(!isFaculty);

  useEffect(() => {
    if (!isFaculty && exam.id) {
      attemptService.getStudentExamStatus(exam.id)
        .then((res) => setStudentStatus(res))
        .catch(() => {})
        .finally(() => setIsLoadingStatus(false));
    }
  }, [exam.id, isFaculty]);

  const statusBadgeVariant = exam.status === 'PUBLISHED' ? 'success' : exam.status === 'DRAFT' ? 'faculty' : 'info';

  const renderStudentAction = () => {
    if (isLoadingStatus) {
      return (
        <Button variant="secondary" size="md" className="w-full text-xs" disabled>
          Loading status...
        </Button>
      );
    }

    if (studentStatus?.has_active_attempt) {
      return (
        <Link href={`/student/exams/${exam.id}`} className="w-full">
          <Button variant="primary" size="md" className="w-full text-xs font-semibold gap-1.5 bg-[#C25E1A] hover:bg-[#A94F13] shadow-warm">
            <Play className="w-3.5 h-3.5 fill-white" /> Resume Exam (Att #{studentStatus.latest_attempt_number})
          </Button>
        </Link>
      );
    }

    if (studentStatus?.reexam_available) {
      return (
        <Link href={`/student/exams/${exam.id}/instructions`} className="w-full">
          <Button variant="primary" size="md" className="w-full text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 shadow-warm">
            <RefreshCw className="w-3.5 h-3.5" /> Start Re-examination
          </Button>
        </Link>
      );
    }

    if (studentStatus?.latest_attempt_status === 'SUBMITTED') {
      return (
        <Button variant="secondary" size="md" className="w-full text-xs gap-1.5 opacity-80" disabled>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Submitted (Attempt #{studentStatus.latest_attempt_number})
        </Button>
      );
    }

    if (studentStatus?.latest_attempt_status === 'EXPIRED') {
      return (
        <Button variant="secondary" size="md" className="w-full text-xs gap-1.5 text-rose-700 bg-rose-50 border-rose-200" disabled>
          <AlertOctagon className="w-3.5 h-3.5" /> Expired
        </Button>
      );
    }

    if (studentStatus && !studentStatus.can_start_or_resume) {
      return (
        <Button variant="secondary" size="md" className="w-full text-xs opacity-70" disabled>
          Attempt Limit Reached
        </Button>
      );
    }

    return (
      <Link href={`/student/exams/${exam.id}/instructions`} className="w-full">
        <Button variant="primary" size="md" className="w-full text-xs font-semibold">
          Start Exam
        </Button>
      </Link>
    );
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-[#EBE5DC] hover:border-[#D0C5B5] shadow-warm transition-all flex flex-col justify-between space-y-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold font-serif text-stone-900 tracking-tight leading-snug line-clamp-1">
            {exam.title}
          </h3>
          <div className="flex items-center gap-1.5">
            {studentStatus?.has_active_attempt && (
              <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                In Progress
              </span>
            )}
            {studentStatus?.reexam_available && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Re-exam
              </span>
            )}
            <Badge variant={statusBadgeVariant}>{exam.status}</Badge>
          </div>
        </div>

        {exam.description && (
          <p className="text-xs text-stone-600 line-clamp-2">{exam.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-xs text-stone-700 pt-2 border-t border-[#EBE5DC]">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-[#C25E1A]" />
            <span>{exam.question_count} Questions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-700" />
            <span>{exam.duration_minutes} Mins</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-stone-600" />
            <span>{exam.total_marks} Marks</span>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-[#EBE5DC] flex items-center justify-between gap-2">
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
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 p-2"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ) : (
          renderStudentAction()
        )}
      </div>
    </div>
  );
};

