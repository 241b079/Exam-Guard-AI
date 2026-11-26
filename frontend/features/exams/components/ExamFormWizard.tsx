'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Settings, Users, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { NegativeMarkingType, AssignmentType, AvailabilityType, AttemptPolicyType } from '../types';
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
  const [autoPublishResults, setAutoPublishResults] = useState<boolean>(initialData?.auto_publish_results ?? false);

  const [attemptPolicy, setAttemptPolicy] = useState<AttemptPolicyType>(initialData?.attempt_policy || 'ONE_ATTEMPT');
  const [maxAttempts, setMaxAttempts] = useState<number>(initialData?.max_attempts || 1);
  const [maxRejoins, setMaxRejoins] = useState<number>(initialData?.max_rejoins ?? 2);

  const [availabilityType, setAvailabilityType] = useState<AvailabilityType>(initialData?.availability_type || 'ALWAYS');
  const [startTime, setStartTime] = useState(initialData?.start_time ? initialData.start_time.slice(0, 16) : '');
  const [endTime, setEndTime] = useState(initialData?.end_time ? initialData.end_time.slice(0, 16) : '');

  const [assignmentType, setAssignmentType] = useState<AssignmentType>(initialData?.assignment_type || 'ALL_STUDENTS');
  const [assignedBatches, setAssignedBatches] = useState<string[]>(initialData?.assigned_batches || []);
  const [customBatchInput, setCustomBatchInput] = useState('');

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
      auto_publish_results: autoPublishResults,
      attempt_policy: attemptPolicy,
      max_attempts: attemptPolicy === 'LIMITED_ATTEMPTS' ? maxAttempts : (attemptPolicy === 'ONE_ATTEMPT' ? 1 : undefined),
      max_rejoins: maxRejoins,
      assignment_type: assignmentType,
      assigned_student_ids: [],
      assigned_batches: assignmentType === 'BATCH' ? assignedBatches : [],
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

          <div className="p-4 bg-[#FAF7F2] border border-[#EBE5DC] rounded-2xl space-y-2">
            <label className="text-sm font-semibold text-stone-900 block">Exam Result Publication Timing</label>
            <p className="text-xs text-stone-500">
              Decide whether student scores are revealed immediately on submission or held until faculty manually clicks &quot;Publish Results&quot;.
            </p>
            <div className="space-y-2.5 pt-2 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer font-medium text-stone-800">
                <input
                  type="radio"
                  name="autoPublishResults"
                  checked={!autoPublishResults}
                  onChange={() => setAutoPublishResults(false)}
                  className="accent-[#C25E1A] mt-0.5"
                />
                <div>
                  <span className="font-semibold block text-stone-900">Manual Faculty Release (Recommended)</span>
                  <span className="text-[11px] text-stone-500 block">
                    Marks and score reports are kept private. Faculty reviews candidate proctoring and clicks &quot;Publish All Results&quot; when ready.
                  </span>
                </div>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer font-medium text-stone-800">
                <input
                  type="radio"
                  name="autoPublishResults"
                  checked={autoPublishResults}
                  onChange={() => setAutoPublishResults(true)}
                  className="accent-[#C25E1A] mt-0.5"
                />
                <div>
                  <span className="font-semibold block text-stone-900">Immediate Publication on Submission</span>
                  <span className="text-[11px] text-stone-500 block">
                    Students immediately see their evaluated score and answers as soon as they submit their exam.
                  </span>
                </div>
              </label>
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

          {/* Exam Attempt & Rejoin Settings (Loop 28) */}
          <div className="space-y-4 pt-4 border-t border-[#EBE5DC]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900">
              Exam Attempt & Rejoin Settings
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-900 block">Attempt Policy</label>
                <div className="space-y-2 p-3 bg-[#FAF7F2] border border-[#EBE5DC] rounded-2xl text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attemptPolicy"
                      checked={attemptPolicy === 'ONE_ATTEMPT'}
                      onChange={() => setAttemptPolicy('ONE_ATTEMPT')}
                      className="accent-[#C25E1A]"
                    />
                    <span className="font-semibold text-stone-800">One Attempt (Default)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attemptPolicy"
                      checked={attemptPolicy === 'LIMITED_ATTEMPTS'}
                      onChange={() => setAttemptPolicy('LIMITED_ATTEMPTS')}
                      className="accent-[#C25E1A]"
                    />
                    <span className="font-semibold text-stone-800">Limited Attempts</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attemptPolicy"
                      checked={attemptPolicy === 'UNLIMITED_ATTEMPTS'}
                      onChange={() => setAttemptPolicy('UNLIMITED_ATTEMPTS')}
                      className="accent-[#C25E1A]"
                    />
                    <span className="font-semibold text-stone-800">Unlimited Attempts</span>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                {attemptPolicy === 'LIMITED_ATTEMPTS' && (
                  <Input
                    label="Maximum Attempts"
                    type="number"
                    min={1}
                    max={10}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                )}
                <Input
                  label="Maximum Rejoins Allowed (Default: 2)"
                  type="number"
                  min={0}
                  max={10}
                  value={maxRejoins}
                  onChange={(e) => setMaxRejoins(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <p className="text-[11px] text-stone-500">
                  Number of times a candidate can reconnect after closing browser/leaving before requiring instructor approval. Page refreshes do not consume rejoins.
                </p>
              </div>
            </div>
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
                { label: 'Specific Batches', value: 'BATCH' },
                { label: 'Selected Students Only', value: 'SELECTED_STUDENTS' },
              ]}
              value={assignmentType}
              onChange={(e) => setAssignmentType(e.target.value as AssignmentType)}
            />

            {assignmentType === 'BATCH' && (
              <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] space-y-3">
                <span className="text-xs font-semibold text-stone-700 uppercase tracking-wider block">
                  Select Enrolled Batches
                </span>
                
                {/* Common quick-select batch chips */}
                <div className="flex flex-wrap gap-2">
                  {['Batch A', 'Batch B', 'Batch C', 'Batch 2024', 'Batch 2025'].map((b) => {
                    const isSelected = assignedBatches.includes(b);
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setAssignedBatches(assignedBatches.filter((x) => x !== b));
                          } else {
                            setAssignedBatches([...assignedBatches, b]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-[#C25E1A] text-white shadow-sm'
                            : 'bg-white text-stone-700 border border-[#EBE5DC] hover:border-stone-400'
                        }`}
                      >
                        {b} {isSelected ? '✓' : '+'}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Batch input */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="Add custom batch name..."
                    value={customBatchInput}
                    onChange={(e) => setCustomBatchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = customBatchInput.trim();
                        if (val && !assignedBatches.includes(val)) {
                          setAssignedBatches([...assignedBatches, val]);
                          setCustomBatchInput('');
                        }
                      }
                    }}
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-[#EBE5DC] bg-white focus:outline-none focus:ring-1 focus:ring-[#C25E1A]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = customBatchInput.trim();
                      if (val && !assignedBatches.includes(val)) {
                        setAssignedBatches([...assignedBatches, val]);
                        setCustomBatchInput('');
                      }
                    }}
                    className="px-3 py-2 bg-[#FBECE0] text-[#C25E1A] font-semibold text-xs rounded-xl border border-[#F6D6C0] hover:bg-[#F6D6C0]"
                  >
                    Add Batch
                  </button>
                </div>

                {/* Selected Batches list */}
                {assignedBatches.length > 0 ? (
                  <div className="pt-2">
                    <p className="text-[11px] text-stone-500 mb-1 font-medium">Assigned Batches:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {assignedBatches.map((b) => (
                        <span
                          key={b}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF0E6] text-[#C25E1A] text-xs font-semibold border border-[#F6D6C0]"
                        >
                          {b}
                          <button
                            type="button"
                            onClick={() => setAssignedBatches(assignedBatches.filter((x) => x !== b))}
                            className="hover:text-red-600 font-bold"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-700 italic">
                    Please select or type at least one batch above. Students in these batches will have access to this exam.
                  </p>
                )}
              </div>
            )}

            {assignmentType === 'SELECTED_STUDENTS' && (
              <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] text-xs text-amber-800 space-y-2">
                <p>Selected students mode enabled. Individual enrolled students can be targeted.</p>
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
            <div>
              <span className="text-xs text-stone-500 block uppercase font-semibold">Target Assignment</span>
              <span className="font-semibold text-stone-900">
                {assignmentType === 'ALL_STUDENTS'
                  ? 'All Students'
                  : assignmentType === 'BATCH'
                  ? `Batches (${assignedBatches.join(', ') || 'None'})`
                  : 'Selected Students'}
              </span>
            </div>
            <div>
              <span className="text-xs text-stone-500 block uppercase font-semibold">Result Publication</span>
              <span className="font-semibold text-stone-900">
                {autoPublishResults ? 'Immediate on Submission' : 'Manual Release by Faculty'}
              </span>
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

