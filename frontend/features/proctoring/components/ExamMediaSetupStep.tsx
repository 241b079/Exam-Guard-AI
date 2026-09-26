'use client';

import React, { useEffect, useRef } from 'react';
import { Camera, Mic, Monitor, CheckCircle, XCircle, AlertTriangle, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useExamMedia } from '../hooks/useExamMedia';
import { examMediaManager } from '../services/examMediaManager';

interface ExamMediaSetupStepProps {
  examId: string;
  onContinue: (cameraStream: MediaStream, screenStream: MediaStream) => void;
  onBack: () => void;
}

export function ExamMediaSetupStep({ examId, onContinue, onBack }: ExamMediaSetupStepProps) {
  const {
    cameraReady,
    micReady,
    screenReady,
    allMediaReady,
    error,
    isCompatible,
    compatibilityError,
    cameraStream,
    cameraStreamRef,
    screenStreamRef,
    requestCameraAndMic,
    requestScreenShare,
  } = useExamMedia({ preserveOnUnmount: true });

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // Attach local camera stream to preview video element and start playback
  useEffect(() => {
    const video = previewVideoRef.current;
    const stream = cameraStream || cameraStreamRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    const playVideo = () => {
      video.play().catch((err) => {
        console.warn('Video preview play prevented:', err);
      });
    };

    video.onloadedmetadata = playVideo;
    playVideo();

    return () => {
      video.onloadedmetadata = null;
    };
  }, [cameraStream, cameraReady]);

  const handleContinue = () => {
    if (allMediaReady && cameraStreamRef.current && screenStreamRef.current) {
      examMediaManager.setPreserveOnUnmount(true);
      examMediaManager.setActiveStreams(cameraStreamRef.current, screenStreamRef.current);
      onContinue(cameraStreamRef.current, screenStreamRef.current);
    }
  };

  if (!isCompatible) {
    return (
      <Card className="p-8 max-w-2xl mx-auto space-y-6 text-center bg-white border border-[#EBE5DC] rounded-3xl shadow-warm">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <XCircle className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold font-serif text-stone-900">Incompatible Browser</h2>
          <p className="text-sm text-stone-600">{compatibilityError}</p>
        </div>
        <Button variant="secondary" onClick={onBack}>
          Go Back
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Title Card */}
      <div className="p-6 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-serif text-stone-900">Exam Monitoring Setup</h1>
            <p className="text-xs text-stone-500">
              Your camera, microphone, and entire screen must remain active and monitored during this exam.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block">Device Permission Error:</span>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Media Check Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Camera & Microphone */}
        <Card className="p-6 space-y-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-serif font-bold text-stone-900 text-base flex items-center gap-2 border-b border-[#EBE5DC] pb-3">
              <Camera className="w-4 h-4 text-[#C25E1A]" /> Audio & Video Verification
            </h3>

            {/* Camera Preview Box */}
            <div className="relative aspect-video w-full rounded-2xl bg-stone-950 overflow-hidden border border-stone-800 flex items-center justify-center">
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${cameraReady ? 'block' : 'hidden'}`}
              />
              {!cameraReady && (
                <div className="text-center p-4 space-y-2">
                  <Camera className="w-8 h-8 text-stone-600 mx-auto" />
                  <span className="text-xs text-stone-400 block">Camera preview will appear here</span>
                </div>
              )}
            </div>

            {/* Camera and Mic Indicators */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] text-xs">
                <span className="font-semibold text-stone-700 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-stone-500" /> Camera:
                </span>
                {cameraReady ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5" /> Connected
                  </span>
                ) : (
                  <span className="text-stone-500 font-medium flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-stone-400" /> Not connected
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] text-xs">
                <span className="font-semibold text-stone-700 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-stone-500" /> Microphone:
                </span>
                {micReady ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5" /> Connected
                  </span>
                ) : (
                  <span className="text-stone-500 font-medium flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-stone-400" /> Not connected
                  </span>
                )}
              </div>
            </div>
          </div>

          <Button
            variant={cameraReady && micReady ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => requestCameraAndMic(true)}
            className="w-full gap-2 text-xs"
          >
            {cameraReady && micReady ? 'Re-check Camera & Mic' : 'Allow Camera & Microphone'}
          </Button>
        </Card>

        {/* Right: Screen Sharing Setup */}
        <Card className="p-6 space-y-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-serif font-bold text-stone-900 text-base flex items-center gap-2 border-b border-[#EBE5DC] pb-3">
              <Monitor className="w-4 h-4 text-[#C25E1A]" /> Entire Desktop Screen Share
            </h3>

            {/* Instruction Notice */}
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2 text-xs text-amber-900">
              <p className="font-bold">Instructions for Screen Sharing:</p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>Share your <strong>Entire Screen / Screen</strong> when prompted.</li>
                <li className="text-rose-700 font-medium">Do not share an individual Tab or Window.</li>
                <li>Keep screen sharing active throughout the exam.</li>
              </ul>
            </div>

            {/* Screen Share Status */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] text-xs">
                <span className="font-semibold text-stone-700 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-stone-500" /> Screen Share:
                </span>
                {screenReady ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5" /> Entire Screen Shared
                  </span>
                ) : (
                  <span className="text-stone-500 font-medium flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-stone-400" /> Not connected
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] text-xs">
                <span className="font-semibold text-stone-700 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-stone-500" /> Faculty Monitoring:
                </span>
                <span className="text-stone-600 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Ready to stream
                </span>
              </div>
            </div>
          </div>

          <Button
            variant={screenReady ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => requestScreenShare(true)}
            className="w-full gap-2 text-xs"
          >
            {screenReady ? 'Re-select Screen Share' : 'Share Entire Screen'}
          </Button>
        </Card>
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-[#EBE5DC]">
        <Button variant="secondary" onClick={onBack} className="gap-2 text-xs">
          <ArrowLeft className="w-4 h-4" /> Back to Verification
        </Button>

        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
          disabled={!allMediaReady}
          className="gap-2 text-sm shadow-warm"
        >
          Continue to Exam <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
