'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { proctoringService } from '../services/proctoringService';
import { ProctoringEventType, ProctoringSeverity } from '../types';

interface UseProctoringStreamProps {
  attemptId?: string;
  isProctoringEnabled?: boolean;
}

export function useProctoringStream({
  attemptId,
  isProctoringEnabled = false,
}: UseProctoringStreamProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [fullscreenExitCount, setFullscreenExitCount] = useState<number>(0);
  const [totalViolations, setTotalViolations] = useState<number>(0);
  const [lastWarning, setLastWarning] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastEventTimeRef = useRef<number>(0);

  // Helper to capture a low-res base64 snapshot from the active video stream
  const captureSnapshot = useCallback((): string | undefined => {
    if (!videoRef.current || !videoRef.current.videoWidth) return undefined;

    try {
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        return canvas.toDataURL('image/jpeg', 0.5);
      }
    } catch {
      // Ignore canvas capture errors
    }
    return undefined;
  }, []);

  // Safe event logger with debounce (min 2.5s between duplicate events)
  const logViolation = useCallback(
    async (
      eventType: ProctoringEventType,
      severity: ProctoringSeverity = 'MEDIUM',
      details?: Record<string, any>
    ) => {
      if (!attemptId || !isProctoringEnabled) return;

      const now = Date.now();
      if (now - lastEventTimeRef.current < 2000) return;
      lastEventTimeRef.current = now;

      setTotalViolations((prev) => prev + 1);

      let warningMessage = 'Security Violation Logged';
      if (eventType === 'TAB_SWITCH') {
        setTabSwitchCount((prev) => prev + 1);
        warningMessage = 'Tab Switch Detected! Please remain on the exam screen.';
      } else if (eventType === 'FULLSCREEN_EXIT') {
        setFullscreenExitCount((prev) => prev + 1);
        warningMessage = 'Fullscreen Mode Exited! Fullscreen is required.';
      } else if (eventType === 'CAMERA_OFF') {
        warningMessage = 'Webcam Disconnected! Camera must remain active.';
      } else if (eventType === 'DEVTOOLS_OPENED') {
        warningMessage = 'Developer tools or shortcut key violation detected.';
      }

      setLastWarning(warningMessage);

      // Snapshot
      const snapshot = captureSnapshot();

      try {
        await proctoringService.logEvent({
          attempt_id: attemptId,
          event_type: eventType,
          severity,
          details: { ...details, clientTimestamp: new Date().toISOString() },
          snapshot_url: snapshot,
        });
      } catch {
        // Silently queue
      }
    },
    [attemptId, isProctoringEnabled, captureSnapshot]
  );

  // Initialize media devices
  useEffect(() => {
    if (!isProctoringEnabled) {
      setIsBlocked(false);
      return;
    }

    let currentStream: MediaStream | null = null;

    async function initMedia() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setIsBlocked(true);
          setBlockReason('Camera access is not supported in this browser. Please use Chrome, Edge, or Firefox.');
          return;
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: true,
        });

        currentStream = mediaStream;
        setStream(mediaStream);
        setIsCameraActive(true);
        setIsMicActive(true);
        setIsBlocked(false);
        setBlockReason(null);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }

        // Listen for track termination
        mediaStream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            setIsCameraActive(false);
            logViolation('CAMERA_OFF', 'HIGH', { reason: 'Video track ended' });
          };
        });

        mediaStream.getAudioTracks().forEach((track) => {
          track.onended = () => {
            setIsMicActive(false);
            logViolation('MIC_OFF', 'MEDIUM', { reason: 'Audio track ended' });
          };
        });
      } catch (err: any) {
        setIsBlocked(true);
        setBlockReason(
          'Webcam and Microphone permissions are strictly required for this exam. Please grant camera access in your browser to proceed.'
        );
      }
    }

    initMedia();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isProctoringEnabled, logViolation]);

  // Handle Tab Switch & Window Blur Listeners
  useEffect(() => {
    if (!isProctoringEnabled || isBlocked) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logViolation('TAB_SWITCH', 'MEDIUM', { reason: 'Document visibility hidden' });
      }
    };

    const handleBlur = () => {
      logViolation('TAB_SWITCH', 'MEDIUM', { reason: 'Window lost focus' });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isProctoringEnabled, isBlocked, logViolation]);

  // Handle Fullscreen tracking
  useEffect(() => {
    if (!isProctoringEnabled || isBlocked) return;

    const handleFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement);
      setIsFullscreen(isFull);
      if (!isFull) {
        logViolation('FULLSCREEN_EXIT', 'MEDIUM', { reason: 'User exited fullscreen mode' });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isProctoringEnabled, isBlocked, logViolation]);

  // Request fullscreen trigger
  const requestFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // Browser blocked programmatic fullscreen without user gesture
    }
  }, []);

  return {
    stream,
    videoRef,
    isCameraActive,
    isMicActive,
    isFullscreen,
    isBlocked,
    blockReason,
    tabSwitchCount,
    fullscreenExitCount,
    totalViolations,
    lastWarning,
    clearLastWarning: () => setLastWarning(null),
    requestFullscreen,
    logViolation,
  };
}
