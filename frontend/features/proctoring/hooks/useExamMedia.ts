import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseExamMediaOptions {
  onCameraStopped?: () => void;
  onMicStopped?: () => void;
  onScreenStopped?: () => void;
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
  const { onCameraStopped, onMicStopped, onScreenStopped } = options;

  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [screenReady, setScreenReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCompatible, setIsCompatible] = useState(true);
  const [compatibilityError, setCompatibilityError] = useState<string | null>(null);

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Check browser compatibility on mount
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
  }, []);

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
   */
  const requestCameraAndMic = useCallback(async (): Promise<MediaStream | null> => {
    setError(null);
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

      // Attach ended listeners
      videoTrack.onended = () => {
        setCameraReady(false);
        if (onCameraStopped) onCameraStopped();
      };

      audioTrack.onended = () => {
        setMicReady(false);
        if (onMicStopped) onMicStopped();
      };

      cameraStreamRef.current = stream;
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
  }, [onCameraStopped, onMicStopped]);

  /**
   * Request Full Desktop Screen Share
   */
  const requestScreenShare = useCallback(async (): Promise<MediaStream | null> => {
    setError(null);
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

      // Attach ended listener (e.g. user clicks native browser "Stop sharing" button)
      screenTrack.onended = () => {
        setScreenReady(false);
        if (onScreenStopped) onScreenStopped();
      };

      screenStreamRef.current = stream;
      setScreenReady(true);
      return stream;
    } catch (err: any) {
      setScreenReady(false);
      const friendlyMsg = parseMediaError(err, 'screen');
      setError(friendlyMsg);
      return null;
    }
  }, [onScreenStopped]);

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

    setCameraReady(false);
    setMicReady(false);
    setScreenReady(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllStreams();
    };
  }, [stopAllStreams]);

  return {
    cameraReady,
    micReady,
    screenReady,
    allMediaReady: cameraReady && micReady && screenReady,
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
