'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { continuousProctoringService } from '../services/continuousProctoringService';

export interface UseScreenSnapshotCaptureOptions {
  examId: string;
  attemptId?: string;
  screenStream: MediaStream | null;
  isActive: boolean;
  periodicIntervalMs?: number; // default 60000 ms (1 snapshot / min)
  onSnapshotCaptured?: (result: { event_id: string; evidence_url: string; trigger_event: string }) => void;
}

export interface UseScreenSnapshotCaptureReturn {
  captureScreenNow: (triggerEvent?: string, metadata?: Record<string, any>) => Promise<string | null>;
  isCapturing: boolean;
  lastSnapshotUrl: string | null;
  lastSnapshotTime: string | null;
}

/**
 * useScreenSnapshotCapture
 * 
 * Securely captures evidence frames of the candidate's active shared screen.
 * Supports:
 * 1. Event-driven snapshot capture (triggered on tab switch, window blur, fullscreen exit, phone detected)
 * 2. Automated background periodic checkpoint snapshots (e.g. every 60s)
 */
export function useScreenSnapshotCapture({
  examId,
  attemptId,
  screenStream,
  isActive,
  periodicIntervalMs = 60000,
  onSnapshotCaptured,
}: UseScreenSnapshotCaptureOptions): UseScreenSnapshotCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastSnapshotUrl, setLastSnapshotUrl] = useState<string | null>(null);
  const [lastSnapshotTime, setLastSnapshotTime] = useState<string | null>(null);

  const offscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastCaptureTimeRef = useRef<number>(0);
  const isBusyRef = useRef<boolean>(false);

  // Maintain offscreen video element for screen stream
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!offscreenVideoRef.current) {
      const vid = document.createElement('video');
      vid.muted = true;
      vid.defaultMuted = true;
      vid.playsInline = true;
      vid.autoplay = true;
      vid.style.position = 'fixed';
      vid.style.top = '-9999px';
      vid.style.left = '-9999px';
      vid.style.width = '1px';
      vid.style.height = '1px';
      vid.style.opacity = '0';
      vid.style.pointerEvents = 'none';
      document.body.appendChild(vid);
      offscreenVideoRef.current = vid;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }

    const video = offscreenVideoRef.current;
    if (screenStream && screenStream.active) {
      if (video.srcObject !== screenStream) {
        video.srcObject = screenStream;
        video.play().catch((err) => {
          console.debug('[useScreenSnapshotCapture] Offscreen video play prevented:', err);
        });
      }
    } else {
      if (video.srcObject) {
        video.srcObject = null;
      }
    }

    return () => {
      // Don't remove on every re-render; clean on unmount
    };
  }, [screenStream]);

  // Clean up offscreen video on component unmount
  useEffect(() => {
    return () => {
      if (offscreenVideoRef.current) {
        try {
          offscreenVideoRef.current.srcObject = null;
          offscreenVideoRef.current.remove();
        } catch {
          // ignore
        }
        offscreenVideoRef.current = null;
      }
    };
  }, []);

  // Main capture function
  const captureScreenNow = useCallback(
    async (triggerEvent: string = 'SCREEN_SNAPSHOT', metadata: Record<string, any> = {}): Promise<string | null> => {
      if (!isActive || !examId || !attemptId || !screenStream || !screenStream.active) {
        return null;
      }

      // Throttle captures: minimum 3 seconds between snapshots to prevent flooding
      const now = Date.now();
      if (now - lastCaptureTimeRef.current < 3000 || isBusyRef.current) {
        return null;
      }

      const videoTrack = screenStream.getVideoTracks().find((t) => t.readyState === 'live');
      if (!videoTrack) {
        return null;
      }

      const video = offscreenVideoRef.current;
      if (!video) return null;

      // Ensure video is playing and has non-zero dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        return null;
      }

      isBusyRef.current = true;
      setIsCapturing(true);

      try {
        let canvas = canvasRef.current;
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvasRef.current = canvas;
        }

        // Limit dimensions to max 1920x1080 to conserve bandwidth while keeping crisp text
        const maxW = 1920;
        const maxH = 1080;
        let targetW = video.videoWidth;
        let targetH = video.videoHeight;

        if (targetW > maxW || targetH > maxH) {
          const ratio = Math.min(maxW / targetW, maxH / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }

        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(video, 0, 0, targetW, targetH);

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas!.toBlob(resolve, 'image/jpeg', 0.82);
        });

        if (!blob || blob.size === 0) {
          return null;
        }

        const enrichedMeta = {
          ...metadata,
          source_resolution: `${video.videoWidth}x${video.videoHeight}`,
          capture_resolution: `${targetW}x${targetH}`,
          timestamp: new Date().toISOString(),
          trigger: triggerEvent,
        };

        const res = await continuousProctoringService.uploadScreenSnapshot(
          examId,
          attemptId,
          blob,
          triggerEvent,
          enrichedMeta
        );

        lastCaptureTimeRef.current = Date.now();
        setLastSnapshotUrl(res.evidence_url);
        setLastSnapshotTime(new Date().toLocaleTimeString());
        onSnapshotCaptured?.(res);

        return res.evidence_url;
      } catch (err) {
        console.warn('[useScreenSnapshotCapture] Screen snapshot upload failed:', err);
        return null;
      } finally {
        isBusyRef.current = false;
        setIsCapturing(false);
      }
    },
    [isActive, examId, attemptId, screenStream, onSnapshotCaptured]
  );

  // Periodic automated screen snapshot capture (e.g. every 60s)
  useEffect(() => {
    if (!isActive || !examId || !attemptId || !screenStream || periodicIntervalMs <= 0) {
      return;
    }

    const interval = setInterval(() => {
      captureScreenNow('PERIODIC_SCREEN_AUDIT', {
        reason: 'Automated periodic candidate screen integrity checkpoint',
      });
    }, periodicIntervalMs);

    return () => clearInterval(interval);
  }, [isActive, examId, attemptId, screenStream, periodicIntervalMs, captureScreenNow]);

  return {
    captureScreenNow,
    isCapturing,
    lastSnapshotUrl,
    lastSnapshotTime,
  };
}
