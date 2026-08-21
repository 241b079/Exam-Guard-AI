'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Upload, Edit, Trash2, ArrowLeft, Send, HelpCircle, CheckCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/shared/Loading';
import { EmptyState } from '@/components/shared/EmptyState';
import { Exam, examService } from '@/features/exams';
import { Question, useQuestions, questionService, QuestionModal } from '@/features/questions';

export default function FacultyQuestionsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.examId as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const { questions, isLoading, error, refreshQuestions } = useQuestions(examId);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const fetchExam = async () => {
    try {
      const data = await examService.getExamById(examId);
      setExam(data);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    if (examId) fetchExam();
  }, [examId]);

  const handleOpenAdd = () => {
    setEditingQuestion(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (q: Question) => {
    setEditingQuestion(q);
    setIsModalOpen(true);
  };

  const handleDelete = async (qId: string) => {
    if (confirm('Are you sure you want to delete this question?')) {
      try {
        await questionService.deleteQuestion(qId);
        refreshQuestions();
        fetchExam();
      } catch (err: any) {
        alert(err.message || 'Failed to delete question');
      }
    }
  };

  const handlePublish = async () => {
    if (!exam) return;
    if (confirm(`Are you sure you want to publish "${exam.title}"?`)) {
      setIsPublishing(true);
      try {
        await examService.publishExam(examId);
        await fetchExam();
        router.push(`/faculty/exams/${examId}`);
      } catch (err: any) {
        alert(err.message || 'Failed to publish exam');
      } finally {
        setIsPublishing(false);
      }
    }
  };

  const totalMarks = questions.reduce((acc, q) => acc + q.marks, 0);

  return (
    <DashboardLayout title="Question Builder">
      <div className="space-y-6">
        <Link href={`/faculty/exams/${examId}`} className="inline-flex items-center gap-2 text-xs text-stone-500 hover:text-stone-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Exam Overview
        </Link>

        {/* Action Header */}
        <div className="p-6 md:p-8 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold font-serif text-stone-900">Questions — {exam?.title || 'Exam'}</h1>
            <p className="text-xs text-stone-500">
              Total Questions: <strong className="text-[#C25E1A]">{questions.length}</strong> • Total Marks: <strong className="text-stone-900">{totalMarks}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm" onClick={handleOpenAdd} className="gap-1.5 text-xs">
              <Plus className="w-4 h-4" /> Add Question
            </Button>

            <Link href={`/faculty/exams/${examId}/import`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Upload className="w-4 h-4" /> Import CSV/Excel
              </Button>
            </Link>

            {exam?.status === 'DRAFT' && questions.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={handlePublish}
                isLoading={isPublishing}
                className="gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-800"
              >
                <Send className="w-4 h-4" /> Publish Exam
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm shadow-warm-sm">
            {error}
          </div>
        )}

        {/* Questions List */}
        {isLoading ? (
          <Loading message="Fetching questions..." />
        ) : questions.length === 0 ? (
          <div className="py-12 space-y-4 text-center">
            <EmptyState
              title="No Questions Added"
              description="Add multiple choice (MCQ) or short answer questions to complete your exam."
            />
            <div className="flex justify-center gap-3">
              <Button variant="primary" onClick={handleOpenAdd} className="gap-2">
                <Plus className="w-4 h-4" /> Add Question Manually
              </Button>
              <Link href={`/faculty/exams/${examId}/import`}>
                <Button variant="outline" className="gap-2">
                  <Upload className="w-4 h-4" /> Import Questions
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <Card key={q.id} className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-stone-500">Question {idx + 1}</span>
                      <Badge variant={q.question_type === 'MCQ' ? 'info' : 'faculty'}>
                        {q.question_type}
                      </Badge>
                      <span className="text-xs font-semibold text-stone-700">{q.marks} Marks</span>
                      {q.negative_marks > 0 && (
                        <span className="text-[11px] text-rose-600">(-{q.negative_marks} Negative)</span>
                      )}
                    </div>
                    <h3 className="text-base font-bold font-serif text-stone-900">{q.question_text}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(q)} className="p-2 text-stone-400 hover:text-stone-700">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(q.id)} className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* MCQ Options Display */}
                {q.question_type === 'MCQ' && q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs">
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = opt === q.correct_answer;
                      return (
                        <div
                          key={optIdx}
                          className={`p-3 rounded-2xl border flex items-center justify-between ${
                            isCorrect
                              ? 'bg-[#DEF7EC] border-[#BCF0DA] text-[#03543F] font-semibold'
                              : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-700'
                          }`}
                        >
                          <span>{String.fromCharCode(65 + optIdx)}: {opt}</span>
                          {isCorrect && <CheckCircle className="w-4 h-4 text-emerald-700" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Short Answer Reference */}
                {q.question_type === 'SHORT_ANSWER' && (
                  <div className="p-3 bg-[#FAF7F2] border border-[#EBE5DC] rounded-2xl text-xs space-y-1">
                    <span className="text-[10px] text-stone-500 font-semibold uppercase block">Expected Answer Reference:</span>
                    <p className="text-stone-700 italic">{q.correct_answer}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>


      {/* Question Form Modal */}
      <QuestionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        examId={examId}
        questionToEdit={editingQuestion}
        onSaved={() => {
          refreshQuestions();
          fetchExam();
        }}
      />
    </DashboardLayout>
  );
}
