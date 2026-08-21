'use client';

import React from 'react';
import { Camera, Mic, Maximize2, ShieldAlert, AlertTriangle, X } from 'lucide-react';

interface ProctoringCameraBadgeProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isCameraActive: boolean;
  isMicActive: boolean;
  isFullscreen: boolean;
  totalViolations: number;
  lastWarning: string | null;
  onClearWarning: () => void;
  onRequestFullscreen: () => void;
}

export const ProctoringCameraBadge: React.FC<ProctoringCameraBadgeProps> = ({
  videoRef,
  isCameraActive,
  isMicActive,
  isFullscreen,
  totalViolations,
  lastWarning,
  onClearWarning,
  onRequestFullscreen,
}) => {
  return (
    <div className="space-y-3">
      {/* Docked Camera Card */}
      <div className="bg-white rounded-3xl border border-[#EBE5DC] shadow-warm overflow-hidden p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-800">
              Live Proctoring
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <Camera className={`w-3.5 h-3.5 ${isCameraActive ? 'text-emerald-700' : 'text-rose-600'}`} />
            <Mic className={`w-3.5 h-3.5 ${isMicActive ? 'text-emerald-700' : 'text-rose-600'}`} />
          </div>
        </div>

        {/* Video Preview Box */}
        <div className="relative aspect-video rounded-2xl bg-stone-900 overflow-hidden border border-[#EBE5DC]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover mirror"
            style={{ transform: 'scaleX(-1)' }}
          />

          {!isCameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900/90 text-stone-400 p-2 text-center text-xs space-y-1">
              <Camera className="w-5 h-5 text-rose-500 animate-pulse" />
              <span className="font-semibold text-white text-[11px]">Camera Inactive</span>
            </div>
          )}

          {/* Status Pills Overlay */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] pointer-events-none">
            <span className="px-2 py-0.5 rounded-full bg-stone-900/70 text-stone-200 backdrop-blur-sm">
              HD 720p
            </span>
            <span className={`px-2 py-0.5 rounded-full font-bold backdrop-blur-sm ${
              totalViolations === 0
                ? 'bg-emerald-950/80 text-emerald-300'
                : 'bg-rose-950/80 text-rose-300'
            }`}>
              {totalViolations} Flags
            </span>
          </div>
        </div>

        {/* Fullscreen Helper Button */}
        {!isFullscreen && (
          <button
            onClick={onRequestFullscreen}
            className="w-full py-2 px-3 rounded-xl bg-[#FBECE0] hover:bg-[#F6D6C0] text-[#C25E1A] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" /> Enable Fullscreen Mode
          </button>
        )}
      </div>

      {/* Warning Alert Toast */}
      {lastWarning && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs shadow-warm flex items-start justify-between gap-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-900">Warning Alert</p>
              <p className="text-rose-700">{lastWarning}</p>
            </div>
          </div>
          <button
            onClick={onClearWarning}
            className="text-rose-400 hover:text-rose-700 p-1 rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
