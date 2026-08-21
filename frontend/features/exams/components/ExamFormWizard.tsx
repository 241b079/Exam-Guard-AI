'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Settings, Users, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { NegativeMarkingType, AssignmentType, AvailabilityType } from '../types';
import { examService } from '../services/examService';

interface ExamFormWizardProps {
  initialData?: any;
  examId?: string;
  isEditing?: boolean;
}

export const ExamFormWizard: React.FC<ExamFormWizardProps> = ({ initialData, examId, isEditing = false }) => {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [hours, setHours] = useState(Math.floor((initialData?.duration_minutes || 60) / 60));
  const [minutes, setMinutes] = useState((initialData?.duration_minutes || 60) % 60);

  const [negativeMarking, setNegativeMarking] = useState<NegativeMarkingType>(initialData?.negative_marking || 'NONE');
  const [autoSubmit, setAutoSubmit] = useState<boolean>(initialData?.auto_submit ?? true);
  const [displayCountdown, setDisplayCountdown] = useState<boolean>(initialData?.display_countdown ?? true);

  const [availabilityType, setAvailabilityType] = useState<AvailabilityType>(initialData?.availability_type || 'ALWAYS');
  const [startTime, setStartTime] = useState(initialData?.start_time ? initialData.start_time.slice(0, 16) : '');
  const [endTime, setEndTime] = useState(initialData?.end_time ? initialData.end_time.slice(0, 16) : '');

  const [assignmentType, setAssignmentType] = useState<AssignmentType>(initialData?.assignment_type || 'ALL_STUDENTS');

  const durationMinutes = (hours * 60) + minutes;

  const handleNext = () => {
    if (step === 1 && !title.trim()) {
      setError('Exam title is required');
      return;
    }
    if (step === 1 && durationMinutes <= 0) {
      setError('Duration must be greater than 0 minutes');
      return;
    }
    setError(null);
    setStep(step + 1);
  };

  const handlePrev = () => {
    setError(null);
    setStep(step - 1);
  };

  const handleSubmit = async (publishAfterSave: boolean = false) => {
    setIsLoading(true);
    setError(null);

    const payload = {
      title,
      description,
      duration_minutes: durationMinutes,
      negative_marking: negativeMarking,
      auto_submit: autoSubmit,
      display_countdown: displayCountdown,
      assignment_type: assignmentType,
      assigned_student_ids: [],
      availability_type: availabilityType,
      start_time: startTime ? new Date(startTime).toISOString() : undefined,
      end_time: endTime ? new Date(endTime).toISOString() : undefined,
    };

    try {
      let createdExam;
      if (isEditing && examId) {
        createdExam = await examService.updateExam(examId, payload);
      } else {
        createdExam = await examService.createExam(payload);
      }

      if (publishAfterSave) {
        await examService.publishExam(createdExam.id);
      }

      router.push(`/faculty/exams/${createdExam.id}/questions`);
    } catch (err: any) {
      setError(err.message || 'Failed to save exam');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      {/* Wizard Steps Indicator */}
      <div className="grid grid-cols-4 gap-3 border-b border-[#EBE5DC] pb-4">
        {[
          { num: 1, label: 'Information', icon: FileText },
          { num: 2, label: 'Settings', icon: Settings },
          { num: 3, label: 'Assignment', icon: Users },
          { num: 4, label: 'Review & Publish', icon: CheckCircle },
        ].map((s) => {
          const Icon = s.icon;
          const isActive = step === s.num;
          const isDone = step > s.num;

          return (
            <button
              key={s.num}
              onClick={() => s.num < step && setStep(s.num)}
              className={`flex items-center gap-2 p-3.5 rounded-2xl border text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-[#FBECE0] border-[#F6D6C0] text-[#C25E1A] shadow-warm-sm'
                  : isDone
                  ? 'bg-[#DEF7EC] border-[#BCF0DA] text-[#03543F]'
                  : 'bg-white border-[#EBE5DC] text-stone-500'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm shadow-warm-sm">
          {error}
        </div>
      )}

      {/* Step 1: Exam Information */}
      {step === 1 && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm space-y-6">
          <h2 className="text-xl font-bold font-serif text-stone-900">1. Exam Information</h2>
          
          <Input
            label="Exam Title *"
            placeholder="e.g. Data Structures & Algorithms Final"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
              Description (Optional)
            </label>
            <textarea
              className="w-full px-3.5 py-2.5 bg-white border border-[#E2DAD0] rounded-xl text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/20 focus:border-[#C25E1A] min-h-[100px]"
              placeholder="Provide instructions or syllabus topics for this exam..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
              Exam Duration *
            </label>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <Input
                label="Hours"
                type="number"
                min={0}
                max={24}
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value) || 0)}
              />
              <Input
                label="Minutes"
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
              />
            </div>
            <p className="text-xs text-stone-500 pt-1">
              Total Duration: <strong className="text-[#C25E1A] font-bold">{durationMinutes} minutes</strong>
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Exam Settings */}
      {step === 2 && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm space-y-6">
          <h2 className="text-xl font-bold font-serif text-stone-900">2. Exam Settings</h2>

          <Select
            label="Negative Marking"
            options={[
              { label: 'No negative marking', value: 'NONE' },
              { label: 'Negative marks per wrong answer', value: 'PER_QUESTION' },
            ]}
            value={negativeMarking}
            onChange={(e) => setNegativeMarking(e.target.value as NegativeMarkingType)}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[#FAF7F2] border border-[#EBE5DC] rounded-2xl space-y-2">
              <label className="text-sm font-semibold text-stone-900 block">Auto Submit on Timeout</label>
              <p className="text-xs text-stone-500">Automatically submit test answers when timer reaches 00:00.</p>
              <div className="flex gap-4 pt-2">
                <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                  <input type="radio" checked={autoSubmit} onChange={() => setAutoSubmit(true)} className="accent-[#C25E1A]" /> Yes (Default)
                </label>
                <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                  <input type="radio" checked={!autoSubmit} onChange={() => setAutoSubmit(false)} className="accent-[#C25E1A]" /> No
                </label>
              </div>
            </div>

            <div className="p-4 bg-[#FAF7F2] border border-[#EBE5DC] rounded-2xl space-y-2">
              <label className="text-sm font-semibold text-stone-900 block">Display Timer Countdown</label>
              <p className="text-xs text-stone-500">Show remaining time clock in top bar of student exam screen.</p>
              <div className="flex gap-4 pt-2">
                <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                  <input type="radio" checked={displayCountdown} onChange={() => setDisplayCountdown(true)} className="accent-[#C25E1A]" /> Yes (Default)
                </label>
                <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                  <input type="radio" checked={!displayCountdown} onChange={() => setDisplayCountdown(false)} className="accent-[#C25E1A]" /> No
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-[#EBE5DC]">
            <Select
              label="Exam Availability"
              options={[
                { label: 'Always available', value: 'ALWAYS' },
                { label: 'Available at specific time window', value: 'SCHEDULED' },
              ]}
              value={availabilityType}
              onChange={(e) => setAvailabilityType(e.target.value as AvailabilityType)}
            />

            {availabilityType === 'SCHEDULED' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC]">
                <Input
                  label="Start Date & Time"
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
                <Input
                  label="End Date & Time"
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Exam Assignment */}
      {step === 3 && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm space-y-6">
          <h2 className="text-xl font-bold font-serif text-stone-900">3. Student Assignment</h2>

          <div className="space-y-4">
            <Select
              label="Assigned Target"
              options={[
                { label: 'All Registered Students', value: 'ALL_STUDENTS' },
                { label: 'Selected Students Only', value: 'SELECTED_STUDENTS' },
              ]}
              value={assignmentType}
              onChange={(e) => setAssignmentType(e.target.value as AssignmentType)}
            />

            {assignmentType === 'SELECTED_STUDENTS' && (
              <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] text-xs text-amber-800 space-y-2">
                <p>Selected students mode enabled. All enrolled students will be able to take this exam by default in Phase 2.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Review & Publish */}
      {step === 4 && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm space-y-6">
          <h2 className="text-xl font-bold font-serif text-stone-900">4. Review & Confirm</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-[#FAF7F2] p-4 rounded-2xl border border-[#EBE5DC]">
            <div>
              <span className="text-xs text-stone-500 block uppercase font-semibold">Title</span>
              <span className="font-semibold text-stone-900">{title}</span>
            </div>
            <div>
              <span className="text-xs text-stone-500 block uppercase font-semibold">Duration</span>
              <span className="font-semibold text-stone-900">{durationMinutes} Minutes</span>
            </div>
            <div>
              <span className="text-xs text-stone-500 block uppercase font-semibold">Negative Marking</span>
              <span className="font-semibold text-stone-900">{negativeMarking}</span>
            </div>
            <div>
              <span className="text-xs text-stone-500 block uppercase font-semibold">Availability</span>
              <span className="font-semibold text-stone-900">{availabilityType}</span>
            </div>
          </div>

          <div className="p-4 bg-[#FBECE0] border border-[#F6D6C0] rounded-2xl text-xs text-[#C25E1A] space-y-1">
            <p className="font-bold">Next Step after saving:</p>
            <p className="text-stone-700">You will be taken directly to the Question Builder to add MCQ / Short Answer questions or import CSV questions.</p>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-[#EBE5DC]">
        {step > 1 ? (
          <Button variant="secondary" onClick={handlePrev} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Previous
          </Button>
        ) : (
          <div />
        )}

        {step < 4 ? (
          <Button variant="primary" onClick={handleNext} className="gap-2">
            Next <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => handleSubmit(false)}
              isLoading={isLoading}
            >
              Save as Draft
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSubmit(false)}
              isLoading={isLoading}
              className="gap-2"
            >
              Proceed to Add Questions <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

