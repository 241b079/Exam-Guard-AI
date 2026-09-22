'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  User as UserIcon,
  ShieldCheck,
  Play,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getImageUrl } from '@/lib/api';
import { identityService } from '../services/identityService';
import { VerificationStatus, VerificationResponse } from '../types';

interface IdentityVerificationStepProps {
  examId: string;
  onVerified: () => void;
  onCancel?: () => void;
}

export const IdentityVerificationStep: React.FC<IdentityVerificationStepProps> = ({
  examId,
  onVerified,
  onCancel,
}) => {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Capture & Verification State
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load current verification status & student info
  useEffect(() => {
    let mounted = true;
    identityService.getVerificationStatus(examId)
      .then((data) => {
        if (mounted) {
          setStatus(data);
          if (data.is_verified) {
            setVerificationResult({
              verified: true,
              message: 'Identity previously verified for this exam attempt.',
              similarity: data.similarity ?? 1.0,
            });
          }
        }
      })
      .catch((err) => {
        if (mounted) {
          setErrorMessage(err.message || 'Failed to check verification status');
        }
      })
      .finally(() => {
        if (mounted) setIsLoadingStatus(false);
      });

    return () => {
      mounted = false;
    };
  }, [examId]);

  // Clean up camera stream tracks
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Start webcam
  const startCamera = async () => {
    setCameraError(null);
    setErrorMessage(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support webcam video capture.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err: any) {
      let msg = 'Failed to access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera access in your browser settings to proceed.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera device was detected on your computer.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is currently in use by another application. Please close other camera apps and retry.';
      }
      setCameraError(msg);
      setCameraActive(false);
    }
  };

  // Capture frame to canvas
  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedDataUrl(dataUrl);

    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
      }
    }, 'image/jpeg', 0.92);

    // Stop webcam preview once photo is captured to save resources and turn off camera light
    stopCamera();
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedBlob(null);
    setCapturedDataUrl(null);
    setVerificationResult(null);
    setErrorMessage(null);
    startCamera();
  };

  // Submit live photo for backend identity verification
  const handleVerifyIdentity = async () => {
    if (!capturedBlob || isVerifying) return;

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const res = await identityService.verifyIdentity(examId, capturedBlob);
      setVerificationResult(res);
      if (!res.verified) {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Identity verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoadingStatus) {
    return (
      <Card className="p-12 text-center space-y-4 max-w-2xl mx-auto">
        <RefreshCw className="w-8 h-8 text-[#C25E1A] animate-spin mx-auto" />
        <p className="text-sm text-stone-600 font-medium">Preparing identity verification module...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Student Identity Card */}
      <div className="p-6 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-stone-100 border-2 border-[#EBE5DC] flex-shrink-0 flex items-center justify-center">
            {status?.profile_picture_url ? (
              <img
                src={getImageUrl(status.profile_picture_url)}
                alt="Registered Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-10 h-10 text-stone-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#C25E1A] bg-[#FBECE0] px-2.5 py-0.5 rounded-full border border-[#F6D6C0]">
                Candidate Verification
              </span>
            </div>
            <h2 className="text-xl font-bold font-serif text-stone-900 mt-1">{status?.student_name}</h2>
            <p className="text-xs text-stone-500 font-mono">Roll / Student ID: {status?.student_id}</p>
          </div>
        </div>

        <div className="text-right flex flex-col items-end">
          <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Pre-Exam Security Check
          </div>
          <span className="text-[11px] text-stone-400 mt-0.5">Biometric Face Authentication</span>
        </div>
      </div>

      {/* Verification Container */}
      <Card className="p-6 md:p-8 space-y-6 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm">
        {/* SUCCESS STATE */}
        {verificationResult?.verified ? (
          <div className="space-y-6 text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="text-2xl font-bold font-serif text-stone-900">Identity Verified</h3>
              <p className="text-sm text-stone-600">
                Your face matches your registered student record with a similarity score of{' '}
                <span className="font-mono font-bold text-emerald-700">
                  {Math.round(verificationResult.similarity * 100)}%
                </span>. You may now proceed to the exam room.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-center gap-4">
              <Button
                variant="primary"
                size="lg"
                onClick={onVerified}
                className="gap-2 px-8 text-base shadow-warm"
              >
                <Play className="w-5 h-5" /> Start Exam Now
              </Button>
            </div>
          </div>
        ) : (
          /* PREVIEW / CAPTURE / VERIFY STATE */
          <div className="space-y-6">
            <div className="border-b border-[#EBE5DC] pb-4">
              <h3 className="text-lg font-bold font-serif text-stone-900">Live Face Photo Verification</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Please look directly at your webcam in adequate lighting. Position your face inside the guide frame.
              </p>
            </div>

            {/* Error Notifications */}
            {errorMessage && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-xs animate-shake">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Verification Error</p>
                  <p>{errorMessage}</p>
                </div>
              </div>
            )}

            {cameraError && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-xs">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Camera Permission Required</p>
                  <p>{cameraError}</p>
                  <div className="pt-2">
                    <Button variant="secondary" size="sm" onClick={startCamera}>
                      Try Again
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Camera Preview or Captured Preview Area */}
            <div className="relative w-full max-w-lg mx-auto aspect-video bg-stone-900 rounded-2xl overflow-hidden border border-[#D5CDC2] shadow-inner flex items-center justify-center">
              {/* 1. Captured Photo Preview */}
              {capturedDataUrl ? (
                <div className="relative w-full h-full">
                  <img
                    src={capturedDataUrl}
                    alt="Captured Live Photo"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 right-3 bg-stone-900/80 backdrop-blur-md text-white text-[11px] font-semibold px-3 py-1 rounded-full border border-white/20">
                    Photo Captured
                  </div>
                </div>
              ) : cameraActive ? (
                /* 2. Live Webcam Stream */
                <div className="relative w-full h-full flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover -scale-x-100"
                  />
                  {/* Face positioning oval guide overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-64 border-2 border-dashed border-white/60 rounded-[50%] shadow-[0_0_0_9999px_rgba(0,0,0,0.3)] animate-pulse" />
                  </div>
                  <div className="absolute bottom-3 text-white/90 text-xs font-medium bg-black/60 px-4 py-1 rounded-full backdrop-blur-sm pointer-events-none">
                    Align your face within the frame
                  </div>
                </div>
              ) : (
                /* 3. Camera Initial / Inactive State */
                <div className="text-center p-6 space-y-4 text-stone-400">
                  <div className="w-14 h-14 rounded-2xl bg-stone-800 flex items-center justify-center mx-auto text-stone-400 border border-stone-700">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-stone-200">Webcam Inactive</p>
                    <p className="text-xs text-stone-400 max-w-xs">
                      Click below to enable camera preview and capture your verification photo.
                    </p>
                  </div>
                  <Button variant="primary" size="sm" onClick={startCamera} className="gap-2">
                    <Camera className="w-4 h-4" /> Enable Camera
                  </Button>
                </div>
              )}
            </div>

            {/* Actions Bar */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#EBE5DC]">
              {onCancel && (
                <Button variant="secondary" onClick={onCancel} disabled={isVerifying}>
                  Cancel
                </Button>
              )}

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                {/* State: Camera active -> show Capture button */}
                {cameraActive && !capturedDataUrl && (
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleCapture}
                    className="gap-2 text-sm shadow-warm"
                  >
                    <Camera className="w-4 h-4" /> Capture Photo
                  </Button>
                )}

                {/* State: Photo captured -> show Retake and Verify buttons */}
                {capturedDataUrl && (
                  <>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={handleRetake}
                      disabled={isVerifying}
                      className="gap-2 text-xs"
                    >
                      <RotateCcw className="w-4 h-4" /> Retake Photo
                    </Button>

                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleVerifyIdentity}
                      isLoading={isVerifying}
                      className="gap-2 text-sm shadow-warm"
                    >
                      <ShieldCheck className="w-5 h-5" />
                      {isVerifying ? 'Verifying Identity...' : 'Verify Identity'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
