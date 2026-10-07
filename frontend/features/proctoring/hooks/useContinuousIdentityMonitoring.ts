'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  continuousProctoringService,
  ContinuousMonitoringState,
  ContinuousVerificationResult,
} from '../services/continuousProctoringService';
import { IDENTITY_MONITORING_CONFIG } from '../config/identityMonitoring';

export interface UseContinuousIdentityMonitoringOptions {
  examId: string;
  isActive: boolean;
  videoElement: HTMLVideoElement | null;
  samplingIntervalMs?: number;
  onSuspiciousEventConfirmed?: (result: ContinuousVerificationResult) => void;
  onStateChange?: (state: ContinuousMonitoringState) => void;
}

export function useContinuousIdentityMonitoring({
  examId,
  isActive,
  videoElement,
  samplingIntervalMs = IDENTITY_MONITORING_CONFIG.FRAME_SAMPLING_INTERVAL_MS,
  onSuspiciousEventConfirmed,
  onStateChange,
}: UseContinuousIdentityMonitoringOptions) {
  const [currentState, setCurrentState] = useState<ContinuousMonitoringState>('NORMAL_VERIFIED');
  const [lastResult, setLastResult] = useState<ContinuousVerificationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorCount, setErrorCount] = useState(0);

  const inFlightRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const onConfirmedRef = useRef(onSuspiciousEventConfirmed);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onConfirmedRef.current = onSuspiciousEventConfirmed;
    onStateChangeRef.current = onStateChange;
  }, [onSuspiciousEventConfirmed, onStateChange]);

  const captureFrameAndVerify = useCallback(async () => {
    if (!isActive || inFlightRef.current || !videoElement) return;

    // Verify video stream is actively playing and ready
    if (
      videoElement.paused ||
      videoElement.ended ||
      videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      videoElement.videoWidth === 0 ||
      videoElement.videoHeight === 0
    ) {
      return;
    }

    inFlightRef.current = true;
    setIsProcessing(true);

    try {
      if (!canvasRef.current && typeof document !== 'undefined') {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      if (!canvas) return;

      const vWidth = videoElement.videoWidth;
      const vHeight = videoElement.videoHeight;
      const maxDim = IDENTITY_MONITORING_CONFIG.FRAME_MAX_WIDTH;

      let drawWidth = vWidth;
      let drawHeight = vHeight;

      if (vWidth > maxDim || vHeight > maxDim) {
        const scale = maxDim / Math.max(vWidth, vHeight);
        drawWidth = Math.max(64, Math.floor(vWidth * scale));
        drawHeight = Math.max(64, Math.floor(vHeight * scale));
      }

      canvas.width = drawWidth;
      canvas.height = drawHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoElement, 0, 0, drawWidth, drawHeight);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          (b) => resolve(b),
          'image/jpeg',
          IDENTITY_MONITORING_CONFIG.FRAME_JPEG_QUALITY
        );
      });

      if (!blob || !isActive) return;

      const res = await continuousProctoringService.verifyContinuousFrame(examId, blob);

      setLastResult(res);
      setCurrentState(res.state);
      setErrorCount(0);

      onStateChangeRef.current?.(res.state);

      if (res.event_created && res.is_suspicious) {
        onConfirmedRef.current?.(res);
      }
    } catch (err: any) {
      // Gracefully handle momentary sampling glitches without throwing UI errors
      setErrorCount((prev) => prev + 1);
    } finally {
      inFlightRef.current = false;
      setIsProcessing(false);
    }
  }, [examId, isActive, videoElement]);

  // Main continuous sampling loop
  useEffect(() => {
    if (!isActive || !videoElement) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      inFlightRef.current = false;
      return;
    }

    // Schedule frame sampling
    const intervalId = setInterval(() => {
      captureFrameAndVerify();
    }, samplingIntervalMs);

    timerRef.current = intervalId;

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      inFlightRef.current = false;
    };
  }, [isActive, videoElement, samplingIntervalMs, captureFrameAndVerify]);

  // Complete cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      canvasRef.current = null;
      inFlightRef.current = false;
    };
  }, []);

  return {
    currentState,
    lastResult,
    isProcessing,
    errorCount,
    captureFrameAndVerify,
  };
}
