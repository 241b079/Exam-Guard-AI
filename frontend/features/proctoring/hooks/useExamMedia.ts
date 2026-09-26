'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { examMediaManager } from '../services/examMediaManager';

export interface UseExamMediaOptions {
  onCameraStopped?: () => void;
  onMicStopped?: () => void;
  onScreenStopped?: () => void;
  preserveOnUnmount?: boolean;
}

export interface MediaState {
  cameraReady: boolean;
  micReady: boolean;
  screenReady: boolean;
  error: string | null;
  isCompatible: boolean;
  compatibilityError: string | null;
}

export function useExamMedia(options: UseExamMediaOptions = {}) {
  const { onCameraStopped, onMicStopped, onScreenStopped, preserveOnUnmount = false } = options;

  // Keep callback refs stable across re-renders
  const onCameraStoppedRef = useRef(onCameraStopped);
  const onMicStoppedRef = useRef(onMicStopped);
  const onScreenStoppedRef = useRef(onScreenStopped);
  const preserveOnUnmountRef = useRef(preserveOnUnmount);

  useEffect(() => {
    onCameraStoppedRef.current = onCameraStopped;
    onMicStoppedRef.current = onMicStopped;
    onScreenStoppedRef.current = onScreenStopped;
    preserveOnUnmountRef.current = preserveOnUnmount;
  }, [onCameraStopped, onMicStopped, onScreenStopped, preserveOnUnmount]);

  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [screenReady, setScreenReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(() => {
    return examMediaManager.getActiveCameraStream();
  });
  const [screenStream, setScreenStream] = useState<MediaStream | null>(() => {
    return examMediaManager.getActiveScreenStream();
  });

  const [isCompatible, setIsCompatible] = useState(true);
  const [compatibilityError, setCompatibilityError] = useState<string | null>(null);

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Helper to attach event listeners to a camera stream
  const attachCameraListeners = useCallback((stream: MediaStream) => {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (videoTrack) {
      videoTrack.onended = () => {
        setCameraReady(false);
        if (onCameraStoppedRef.current) onCameraStoppedRef.current();
      };
    }
    if (audioTrack) {
      audioTrack.onended = () => {
        setMicReady(false);
        if (onMicStoppedRef.current) onMicStoppedRef.current();
      };
    }
  }, []);

  // Helper to attach event listeners to a screen stream
  const attachScreenListeners = useCallback((stream: MediaStream) => {
    const screenTrack = stream.getVideoTracks()[0];
    if (screenTrack) {
      screenTrack.onended = () => {
        setScreenReady(false);
        if (onScreenStoppedRef.current) onScreenStoppedRef.current();
      };
    }
  }, []);

  // On mount: check browser compatibility and adopt existing active streams from examMediaManager if present
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsCompatible(false);
      setCompatibilityError(
        'Your browser does not support webcam/microphone capture. Please use a modern browser such as Chrome, Firefox, or Edge.'
      );
    } else if (!navigator.mediaDevices.getDisplayMedia) {
      setIsCompatible(false);
      setCompatibilityError(
        'Your browser does not support screen sharing. Please use a supported modern desktop browser.'
      );
    } else if (!window.RTCPeerConnection) {
      setIsCompatible(false);
      setCompatibilityError(
        'Your browser does not support WebRTC peer connections. Please update or use a modern browser.'
      );
    } else {
      setIsCompatible(true);
      setCompatibilityError(null);
    }

    // Check if active streams already exist in manager
    const existingCam = examMediaManager.getActiveCameraStream();
    if (existingCam) {
      cameraStreamRef.current = existingCam;
      setCameraStream(existingCam);
      attachCameraListeners(existingCam);
      setCameraReady(existingCam.getVideoTracks().some((t) => t.readyState === 'live'));
      setMicReady(existingCam.getAudioTracks().some((t) => t.readyState === 'live'));
    }

    const existingScreen = examMediaManager.getActiveScreenStream();
    if (existingScreen) {
      screenStreamRef.current = existingScreen;
      setScreenStream(existingScreen);
      attachScreenListeners(existingScreen);
      setScreenReady(existingScreen.getVideoTracks().some((t) => t.readyState === 'live'));
    }
  }, [attachCameraListeners, attachScreenListeners]);

  const parseMediaError = (err: any, deviceType: 'camera/microphone' | 'screen'): string => {
    const errName = err?.name || '';
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
      return `${deviceType === 'screen' ? 'Screen sharing' : 'Camera or microphone'} permission was denied. Please allow permission in your browser settings and try again.`;
    }
    if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
      return `Required ${deviceType} device was not found. Please ensure your camera and microphone are connected.`;
    }
    if (errName === 'NotReadableError' || errName === 'TrackStartError') {
      return `Could not access ${deviceType}. It might be currently in use by another application.`;
    }
    if (errName === 'OverconstrainedError') {
      return `The requested ${deviceType} resolution or constraints could not be satisfied.`;
    }
    if (errName === 'SecurityError') {
      return `Security error accessing ${deviceType}. Please ensure you are on a secure (HTTPS or localhost) origin.`;
    }
    if (errName === 'AbortError') {
      return `${deviceType} setup was aborted or cancelled.`;
    }
    return err?.message || `Failed to access ${deviceType}.`;
  };

  /**
   * Request Webcam and Microphone streams
   * If force is false and an active live stream is already present, reuse it without prompting.
   */
  const requestCameraAndMic = useCallback(async (force: boolean = false): Promise<MediaStream | null> => {
    setError(null);

    // Reuse existing live stream if available and not forced
    if (!force) {
      const activeCam = examMediaManager.getActiveCameraStream() || cameraStreamRef.current;
      if (activeCam && activeCam.active && activeCam.getVideoTracks().some((t) => t.readyState === 'live')) {
        cameraStreamRef.current = activeCam;
        setCameraStream(activeCam);
        attachCameraListeners(activeCam);
        setCameraReady(true);
        setMicReady(true);
        return activeCam;
      }
    }

    try {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 24 },
        },
        audio: true,
      });

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (!videoTrack || videoTrack.readyState !== 'live') {
        throw new Error('Webcam video track could not be activated.');
      }
      if (!audioTrack || audioTrack.readyState !== 'live') {
        throw new Error('Microphone audio track could not be activated.');
      }

      attachCameraListeners(stream);

      cameraStreamRef.current = stream;
      setCameraStream(stream);
      examMediaManager.setActiveStreams(stream, null);
      setCameraReady(true);
      setMicReady(true);
      return stream;
    } catch (err: any) {
      setCameraReady(false);
      setMicReady(false);
      const friendlyMsg = parseMediaError(err, 'camera/microphone');
      setError(friendlyMsg);
      return null;
    }
  }, [attachCameraListeners]);

  /**
   * Request Full Desktop Screen Share
   * If force is false and an active live screen stream is already present, reuse it without prompting.
   */
  const requestScreenShare = useCallback(async (force: boolean = false): Promise<MediaStream | null> => {
    setError(null);

    // Reuse existing live stream if available and not forced
    if (!force) {
      const activeScreen = examMediaManager.getActiveScreenStream() || screenStreamRef.current;
      if (activeScreen && activeScreen.active && activeScreen.getVideoTracks().some((t) => t.readyState === 'live')) {
        screenStreamRef.current = activeScreen;
        setScreenStream(activeScreen);
        attachScreenListeners(activeScreen);
        setScreenReady(true);
        return activeScreen;
      }
    }

    examMediaManager.setIsRequestingScreen(true);
    try {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 10, max: 15 },
        },
        audio: false,
      });

      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack || screenTrack.kind !== 'video' || screenTrack.readyState !== 'live') {
        throw new Error('Screen sharing video track was not active.');
      }

      attachScreenListeners(stream);

      screenStreamRef.current = stream;
      setScreenStream(stream);
      examMediaManager.setActiveStreams(null, stream);
      setScreenReady(true);
      return stream;
    } catch (err: any) {
      setScreenReady(false);
      const friendlyMsg = parseMediaError(err, 'screen');
      setError(friendlyMsg);
      return null;
    } finally {
      examMediaManager.setIsRequestingScreen(false);
    }
  }, [attachScreenListeners]);

  /**
   * Stop all active MediaStream tracks and reset states
   */
  const stopAllStreams = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      cameraStreamRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenStreamRef.current = null;
    }

    examMediaManager.clearAll();

    setCameraStream(null);
    setScreenStream(null);
    setCameraReady(false);
    setMicReady(false);
    setScreenReady(false);
  }, []);

  // Cleanup on unmount: only stop streams if preservation was not requested
  useEffect(() => {
    return () => {
      if (!preserveOnUnmountRef.current && !examMediaManager.shouldPreserve()) {
        stopAllStreams();
      }
    };
  }, [stopAllStreams]);

  return {
    cameraReady,
    micReady,
    screenReady,
    allMediaReady: cameraReady && micReady && screenReady,
    cameraStream,
    screenStream,
    error,
    setError,
    isCompatible,
    compatibilityError,
    cameraStreamRef,
    screenStreamRef,
    requestCameraAndMic,
    requestScreenShare,
    stopAllStreams,
  };
}
