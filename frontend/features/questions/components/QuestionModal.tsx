'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Question, QuestionType } from '../types';
import { questionService } from '../services/questionService';

interface QuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  examId: string;
  questionToEdit?: Question | null;
  onSaved: () => void;
}

export const QuestionModal: React.FC<QuestionModalProps> = ({
  isOpen,
  onClose,
  examId,
  questionToEdit,
  onSaved,
}) => {
  const [questionType, setQuestionType] = useState<QuestionType>('MCQ');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [marks, setMarks] = useState(2);
  const [negativeMarks, setNegativeMarks] = useState(0);
  const [explanation, setExplanation] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (questionToEdit) {
      setQuestionType(questionToEdit.question_type);
      setQuestionText(questionToEdit.question_text);
      setOptions(questionToEdit.options && questionToEdit.options.length > 0 ? questionToEdit.options : ['', '', '', '']);
      setCorrectAnswer(questionToEdit.correct_answer);
      setMarks(questionToEdit.marks);
      setNegativeMarks(questionToEdit.negative_marks);
      setExplanation(questionToEdit.explanation || '');
    } else {
      setQuestionType('MCQ');
      setQuestionText('');
      setOptions(['', '', '', '']);
      setCorrectAnswer('');
      setMarks(2);
      setNegativeMarks(0);
      setExplanation('');
    }
  }, [questionToEdit, isOpen]);

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      const updated = options.filter((_, i) => i !== index);
      setOptions(updated);
      if (correctAnswer === options[index]) {
        setCorrectAnswer('');
      }
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...options];
    const oldVal = updated[index];
    updated[index] = val;
    setOptions(updated);
    if (correctAnswer === oldVal) {
      setCorrectAnswer(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!questionText.trim()) {
      setError('Question text is required');
      return;
    }

    let finalCorrectAnswer = correctAnswer;
    let finalOptions: string[] = [];

    if (questionType === 'MCQ') {
      finalOptions = options.map(o => o.trim()).filter(o => o.length > 0);
      if (finalOptions.length < 2) {
        setError('At least 2 options are required for MCQ');
        return;
      }
      if (!finalCorrectAnswer) {
        setError('Please select a correct answer');
        return;
      }
    } else {
      if (!finalCorrectAnswer.trim()) {
        setError('Expected answer is required for Short Answer question');
        return;
      }
    }

    setIsLoading(true);

    try {
      const payload = {
        question_type: questionType,
        question_text: questionText,
        options: finalOptions,
        correct_answer: finalCorrectAnswer,
        marks: Number(marks),
        negative_marks: Number(negativeMarks),
        explanation: explanation || undefined,
      };

      if (questionToEdit) {
        await questionService.updateQuestion(questionToEdit.id, payload);
      } else {
        await questionService.createQuestion(examId, payload);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save question');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-2xl p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm-lg space-y-6 animate-in fade-in zoom-in-95 duration-150 my-8">
        <div className="flex items-center justify-between border-b border-[#EBE5DC] pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
              <HelpCircle className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold font-serif text-stone-900">
              {questionToEdit ? 'Edit Question' : 'Add New Question'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-[#FAF7F2]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Select
            label="Question Type"
            options={[
              { label: 'Multiple Choice (MCQ)', value: 'MCQ' },
              { label: 'Short Answer', value: 'SHORT_ANSWER' },
            ]}
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value as QuestionType)}
          />

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
              Question Text *
            </label>
            <textarea
              className="w-full px-3.5 py-2.5 bg-white border border-[#E2DAD0] rounded-xl text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/20 focus:border-[#C25E1A] min-h-[90px]"
              placeholder="e.g. Which data structure operates on a First-In, First-Out (FIFO) basis?"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              required
            />
          </div>

          {/* MCQ Options */}
          {questionType === 'MCQ' && (
            <div className="space-y-3 p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                  Options & Correct Answer Selection *
                </label>
                {options.length < 6 && (
                  <Button type="button" variant="outline" size="sm" onClick={handleAddOption} className="text-xs gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add Option
                  </Button>
                )}
              </div>

              <div className="space-y-2.5">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="correctOption"
                      checked={correctAnswer === opt && opt.length > 0}
                      onChange={() => setCorrectAnswer(opt)}
                      title="Select as correct answer"
                      className="w-4 h-4 text-[#C25E1A] accent-[#C25E1A] cursor-pointer"
                    />
                    <span className="text-xs font-bold text-stone-500 w-6">
                      {String.fromCharCode(65 + i)}:
                    </span>
                    <input
                      type="text"
                      className="flex-1 px-3 py-1.5 bg-white border border-[#E2DAD0] rounded-xl text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/20 focus:border-[#C25E1A]"
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      value={opt}
                      onChange={(e) => handleOptionChange(i, e.target.value)}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(i)}
                        className="text-stone-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-stone-500 italic pt-1">
                Click the radio button next to an option to set it as the Correct Answer.
              </p>
            </div>
          )}

          {/* Short Answer Expected Answer */}
          {questionType === 'SHORT_ANSWER' && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                Expected Answer (Reference for Grading) *
              </label>
              <textarea
                className="w-full px-3.5 py-2.5 bg-white border border-[#E2DAD0] rounded-xl text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/20 focus:border-[#C25E1A] min-h-[70px]"
                placeholder="Enter expected keywords or model response..."
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                required
              />
            </div>
          )}

          {/* Marks & Negative Marks */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Marks *"
              type="number"
              step="0.5"
              min={0.5}
              value={marks}
              onChange={(e) => setMarks(parseFloat(e.target.value) || 0)}
              required
            />
            <Input
              label="Negative Marks"
              type="number"
              step="0.25"
              min={0}
              value={negativeMarks}
              onChange={(e) => setNegativeMarks(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#EBE5DC]">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isLoading}>
              {questionToEdit ? 'Update Question' : 'Save Question'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
