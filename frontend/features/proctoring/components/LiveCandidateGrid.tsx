'use client';

import React from 'react';
import { Shield, AlertTriangle, Clock, Eye, Ban, Radio, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LiveCandidate } from '../types';

interface LiveCandidateGridProps {
  candidates: LiveCandidate[];
  onViewTimeline: (candidate: LiveCandidate) => void;
  onTerminate: (candidate: LiveCandidate) => void;
}

export const LiveCandidateGrid: React.FC<LiveCandidateGridProps> = ({
  candidates,
  onViewTimeline,
  onTerminate,
}) => {
  if (candidates.length === 0) {
    return (
      <div className="p-12 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm text-center space-y-3">
        <Radio className="w-8 h-8 text-stone-400 mx-auto animate-pulse" />
        <h3 className="text-base font-bold font-serif text-stone-800">No Active Candidates Yet</h3>
        <p className="text-xs text-stone-500 max-w-sm mx-auto">
          Candidate video streams and proctoring telemetry will appear here as soon as students start this exam.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {candidates.map((c) => {
        const isHighRisk = c.risk_level === 'HIGH';
        const isMedRisk = c.risk_level === 'MEDIUM';

        const trustBadgeClass =
          c.trust_score >= 80
            ? 'bg-[#DEF7EC] text-[#03543F] border-[#BCF0DA]'
            : c.trust_score >= 50
            ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
            : 'bg-[#FDE8E8] text-[#9B1C1C] border-[#F8B4B4]';

        return (
          <div
            key={c.attempt_id}
            className={`bg-white rounded-3xl border transition-all p-5 shadow-warm flex flex-col justify-between space-y-4 ${
              isHighRisk
                ? 'border-rose-300 ring-2 ring-rose-500/10'
                : isMedRisk
                ? 'border-amber-300'
                : 'border-[#EBE5DC] hover:border-[#D0C5B5]'
            }`}
          >
            {/* Header: Candidate Info & Trust Score */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      {c.is_live ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                        </>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-stone-400"></span>
                      )}
                    </span>
                    <h3 className="font-bold font-serif text-stone-900 line-clamp-1">
                      {c.student_name}
                    </h3>
                  </div>
                  <p className="text-xs text-[#C25E1A] font-mono">
                    {c.student_roll_no ? `Roll: ${c.student_roll_no}` : c.student_email}
                  </p>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border ${trustBadgeClass}`}
                  title="Candidate Integrity Trust Score"
                >
                  {c.trust_score}% Trust
                </span>
              </div>

              {/* Video Stream Snapshot Box */}
              <div className="relative aspect-video rounded-2xl bg-stone-950 overflow-hidden border border-[#EBE5DC] flex items-center justify-center">
                {c.latest_event?.snapshot_url ? (
                  <img
                    src={c.latest_event.snapshot_url}
                    alt={c.student_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-stone-400 space-y-1">
                    <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center font-bold text-stone-300 font-serif">
                      {c.student_name.charAt(0)}
                    </div>
                    <span className="text-[10px] text-stone-500 font-mono">Live Feed Connected</span>
                  </div>
                )}

                {/* Status Badges Overlay */}
                <div className="absolute top-2 left-2 flex gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md ${
                      c.status === 'IN_PROGRESS'
                        ? 'bg-emerald-950/80 text-emerald-300'
                        : 'bg-stone-900/80 text-stone-300'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>

                <div className="absolute bottom-2 right-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md ${
                      c.total_violations === 0
                        ? 'bg-emerald-950/80 text-emerald-300'
                        : 'bg-rose-950/80 text-rose-300'
                    }`}
                  >
                    {c.total_violations} Infractions
                  </span>
                </div>
              </div>

              {/* Infraction Breakdown Chips */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] flex items-center justify-between">
                  <span className="text-stone-600 text-[11px]">Tab Switches</span>
                  <strong className={`font-mono ${c.tab_switch_count > 0 ? 'text-rose-700' : 'text-stone-900'}`}>
                    {c.tab_switch_count}
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] flex items-center justify-between">
                  <span className="text-stone-600 text-[11px]">Screen Exits</span>
                  <strong className={`font-mono ${c.fullscreen_exit_count > 0 ? 'text-rose-700' : 'text-stone-900'}`}>
                    {c.fullscreen_exit_count}
                  </strong>
                </div>
              </div>

              {/* Latest Event Notice */}
              {c.latest_event && (
                <div className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] text-[11px] text-stone-700 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#C25E1A] shrink-0 mt-0.5" />
                  <div className="line-clamp-1">
                    <span className="font-semibold text-stone-900">{c.latest_event.event_type}</span> —{' '}
                    <span className="text-stone-500">
                      {new Date(c.latest_event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Action Buttons */}
            <div className="pt-3 border-t border-[#EBE5DC] flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewTimeline(c)}
                className="flex-1 gap-1.5 text-xs"
              >
                <Eye className="w-3.5 h-3.5" /> Event Log
              </Button>

              {c.status === 'IN_PROGRESS' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTerminate(c)}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs px-2.5"
                  title="Terminate Candidate Attempt"
                >
                  <Ban className="w-3.5 h-3.5" /> Terminate
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
