'use client';

import React from 'react';
import { Camera, Mic, ShieldAlert, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ProctoringPermissionModalProps {
  isOpen: boolean;
  isCameraActive: boolean;
  isMicActive: boolean;
  blockReason: string | null;
  onRetry: () => void;
  onProceed?: () => void;
}

export const ProctoringPermissionModal: React.FC<ProctoringPermissionModalProps> = ({
  isOpen,
  isCameraActive,
  isMicActive,
  blockReason,
  onRetry,
  onProceed,
}) => {
  if (!isOpen) return null;

  const isReady = isCameraActive && isMicActive;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md">
      <div className="bg-white w-full max-w-lg p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm-lg space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0] flex items-center justify-center mx-auto shadow-warm-sm">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold font-serif text-stone-900">
            Proctored Examination
          </h2>
          <p className="text-xs text-stone-600 max-w-sm mx-auto">
            This examination is strictly monitored by AI Proctoring. You must grant camera and microphone access before entering.
          </p>
        </div>

        {/* Verification Checklist */}
        <div className="space-y-3 p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC]">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-medium text-stone-800">
              <Camera className="w-4 h-4 text-[#C25E1A]" /> Webcam Video Stream
            </span>
            {isCameraActive ? (
              <span className="flex items-center gap-1 text-emerald-700 font-bold">
                <CheckCircle2 className="w-4 h-4" /> Granted
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-600 font-bold">
                <AlertCircle className="w-4 h-4" /> Blocked / Inactive
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-[#EBE5DC]">
            <span className="flex items-center gap-2 font-medium text-stone-800">
              <Mic className="w-4 h-4 text-[#C25E1A]" /> Microphone Audio Stream
            </span>
            {isMicActive ? (
              <span className="flex items-center gap-1 text-emerald-700 font-bold">
                <CheckCircle2 className="w-4 h-4" /> Granted
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-600 font-bold">
                <AlertCircle className="w-4 h-4" /> Blocked / Inactive
              </span>
            )}
          </div>
        </div>

        {/* Rules & Warnings */}
        <div className="p-3.5 bg-[#FFF8F0] border border-[#F6D6C0] rounded-2xl text-[11px] text-stone-700 space-y-1.5">
          <p className="font-bold text-[#C25E1A] uppercase tracking-wider">Exam Rules Enforced:</p>
          <ul className="list-disc list-inside space-y-1 text-stone-600">
            <li>Your face must remain clearly visible in the camera frame throughout the session.</li>
            <li>Tab switches, minimizing the browser, or exiting fullscreen are recorded as infractions.</li>
            <li>If permissions are revoked or stream disconnects, your exam session will be paused/flagged.</li>
          </ul>
        </div>

        {blockReason && !isReady && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-center font-medium">
            {blockReason}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="md" onClick={onRetry} className="gap-1.5 text-xs">
            <RefreshCw className="w-4 h-4" /> Recheck Permissions
          </Button>

          {isReady && onProceed ? (
            <Button variant="primary" size="md" onClick={onProceed} className="text-xs font-semibold">
              Enter Examination
            </Button>
          ) : (
            <Button variant="primary" size="md" disabled className="text-xs font-semibold opacity-50 cursor-not-allowed">
              Camera Required
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
