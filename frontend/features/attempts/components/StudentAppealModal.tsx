'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AlertTriangle, Send, ShieldAlert, FileText, CheckCircle2 } from 'lucide-react';
import { attemptService } from '../services/attemptService';

interface StudentAppealModalProps {
  isOpen: boolean;
  onClose: () => void;
  attempt: {
    attempt_id: string;
    exam_title: string;
    attempt_number: number;
    disqualification_reason?: string | null;
    disqualification_evidence?: string | null;
    appeal_status?: string | null;
    appeal_reason?: string | null;
  } | null;
  onAppealSubmitted?: (attemptId: string) => void;
}

export const StudentAppealModal: React.FC<StudentAppealModalProps> = ({
  isOpen,
  onClose,
  attempt,
  onAppealSubmitted,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!attempt) return null;

  const isAlreadyPending = attempt.appeal_status === 'PENDING_REVIEW';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 15) {
      setError('Please provide a substantive statement (at least 15 characters) explaining your appeal.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await attemptService.submitAppeal(attempt.attempt_id, reason.trim());
      setIsSuccess(true);
      if (onAppealSubmitted) {
        onAppealSubmitted(attempt.attempt_id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to submit appeal. Please try again or contact support.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsSuccess(false);
    setReason('');
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Academic Integrity Appeal & Review Request" maxWidth="lg">
      <div className="space-y-5">
        {/* Attempt Context Header */}
        <div className="p-4 rounded-2xl bg-stone-50 border border-[#EBE5DC] flex items-center justify-between">
          <div>
            <h3 className="font-bold font-serif text-stone-900 text-sm">{attempt.exam_title}</h3>
            <span className="text-xs text-stone-500">Examination Attempt #{attempt.attempt_number}</span>
          </div>
          <Badge variant="danger">DISQUALIFIED</Badge>
        </div>

        {/* Existing Disqualification Reason from Faculty */}
        <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-2">
          <div className="flex items-center gap-2 text-rose-800 text-xs font-bold uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            Adjudication Finding & Disqualification Reason
          </div>
          <p className="text-xs text-rose-950 font-medium leading-relaxed bg-white/70 p-3 rounded-xl border border-rose-100">
            "{attempt.disqualification_reason || 'Academic integrity policy violation identified by proctoring audit.'}"
          </p>
          {attempt.disqualification_evidence && (
            <p className="text-[11px] text-rose-800 italic">
              Evidence Log: {attempt.disqualification_evidence}
            </p>
          )}
        </div>

        {isSuccess ? (
          <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-emerald-900 font-serif">Appeal Formally Registered</h4>
            <p className="text-xs text-emerald-800 max-w-sm mx-auto leading-relaxed">
              Your appeal statement has been registered with the Academic Integrity Review Committee and course faculty.
              You will receive an update once committee deliberations conclude.
            </p>
            <Button variant="primary" size="sm" onClick={handleClose} className="mt-2">
              Done
            </Button>
          </div>
        ) : isAlreadyPending ? (
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
            <div className="flex items-center gap-2 text-amber-900 text-xs font-bold uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              Appeal Already Under Committee Review
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              You submitted an appeal for this attempt. It is currently under active review. No further submission is required.
            </p>
            {attempt.appeal_reason && (
              <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60 text-xs text-stone-700">
                <span className="font-semibold block text-stone-900 text-[11px] uppercase pb-1">Your Submitted Statement:</span>
                "{attempt.appeal_reason}"
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-stone-800 uppercase tracking-wider">
                Candidate Explanation & Statement of Appeal <span className="text-rose-600">*</span>
              </label>
              <p className="text-[11px] text-stone-500 leading-normal">
                State your grounds for appeal. Specify any technical failures, mitigating factors, environmental anomalies, or reasons why the proctoring evidence was misinterpreted.
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Example: During Question 2, my network disconnected and my laptop camera froze for 30 seconds. I did not consult any external notes or phone..."
                rows={5}
                required
                className="w-full text-xs p-3.5 rounded-2xl border border-[#EBE5DC] focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/30 focus:border-[#C25E1A] bg-stone-50/50 resize-none transition-all placeholder:text-stone-400"
              />
              <div className="flex justify-between items-center text-[10px] text-stone-400 px-1">
                <span>Minimum 15 characters required</span>
                <span>{reason.length} characters</span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EBE5DC]">
              <Button type="button" variant="outline" size="md" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting || reason.trim().length < 15}
                className="gap-2 bg-[#C25E1A] hover:bg-[#A94F13] text-white"
              >
                <Send className="w-3.5 h-3.5" />
                {isSubmitting ? 'Submitting Appeal...' : 'Submit Appeal Request'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
