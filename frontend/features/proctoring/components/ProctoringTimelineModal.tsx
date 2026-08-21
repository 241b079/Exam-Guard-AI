'use client';

import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Clock, AlertTriangle, CheckCircle, Info, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ProctoringEvent, LiveCandidate } from '../types';
import { proctoringService } from '../services/proctoringService';
import { Loading } from '@/components/shared/Loading';

interface ProctoringTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: LiveCandidate | null;
}

export const ProctoringTimelineModal: React.FC<ProctoringTimelineModalProps> = ({
  isOpen,
  onClose,
  candidate,
}) => {
  const [events, setEvents] = useState<ProctoringEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !candidate) return;

    async function loadTimeline() {
      if (!candidate) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await proctoringService.getAttemptTimeline(candidate.attempt_id);
        setEvents(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load candidate proctoring logs');
      } finally {
        setIsLoading(false);
      }
    }

    loadTimeline();
  }, [isOpen, candidate]);

  if (!isOpen || !candidate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-2xl p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm-lg space-y-6 animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#EBE5DC] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0] flex items-center justify-center font-bold text-base">
              {candidate.student_name.charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-bold font-serif text-stone-900">
                {candidate.student_name}
              </h2>
              <p className="text-xs text-stone-500 font-mono">
                {candidate.student_roll_no ? `Roll No: ${candidate.student_roll_no}` : candidate.student_email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              candidate.trust_score >= 80
                ? 'bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]'
                : candidate.trust_score >= 50
                ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                : 'bg-[#FDE8E8] text-[#9B1C1C] border border-[#F8B4B4]'
            }`}>
              {candidate.trust_score}% Trust
            </span>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-[#FAF7F2]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {isLoading ? (
          <Loading message="Loading candidate event history..." />
        ) : events.length === 0 ? (
          <div className="py-10 text-center space-y-2 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC]">
            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold font-serif text-stone-800">Clean Session Record</p>
            <p className="text-xs text-stone-500">No infractions or security warnings have been flagged for this candidate.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            <p className="text-xs text-stone-500 font-medium">
              Total Logged Incidents: <strong className="text-stone-900">{events.length}</strong>
            </p>

            <div className="space-y-2.5">
              {events.map((ev, i) => {
                const isHigh = ev.severity === 'HIGH';
                const isMed = ev.severity === 'MEDIUM';

                return (
                  <div
                    key={ev.id || i}
                    className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 text-xs ${
                      isHigh
                        ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                        : isMed
                        ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                        : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-800'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isHigh
                            ? 'bg-rose-200 text-rose-800'
                            : isMed
                            ? 'bg-amber-200 text-amber-800'
                            : 'bg-stone-200 text-stone-700'
                        }`}>
                          {ev.severity}
                        </span>
                        <strong className="font-mono text-stone-900">{ev.event_type}</strong>
                      </div>

                      {ev.details && Object.keys(ev.details).length > 0 && (
                        <p className="text-[11px] text-stone-600 font-mono">
                          {JSON.stringify(ev.details)}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0 space-y-1">
                      <span className="text-[11px] text-stone-500 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>

                      {ev.snapshot_url && (
                        <a
                          href={ev.snapshot_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-[#C25E1A] font-semibold hover:underline"
                        >
                          <ImageIcon className="w-3 h-3" /> View Snapshot
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end pt-3 border-t border-[#EBE5DC]">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
