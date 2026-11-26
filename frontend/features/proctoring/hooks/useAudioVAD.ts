'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { attemptService } from '@/features/attempts/services/attemptService';
import { continuousProctoringService } from '../services/continuousProctoringService';

export interface UseAudioVADOptions {
  examId?: string;
  attemptId?: string | null;
  audioStream: MediaStream | null;
  isActive: boolean;
  onVoiceDetected?: (meta: { decibels: number; sustainedMs: number; speechRatio: number }) => void;
  minSpeechDurationMs?: number; // default 1500ms
  cooldownMs?: number; // default 12000ms
}

/**
 * useAudioVAD
 * 
 * Real-time Voice Activity Detection (VAD) & Acoustic Evidence Recorder.
 * 1. Analyzes microphone input frequency band (85Hz - 2500Hz vocal range) via Web Audio API.
 * 2. Maintains a lightweight rolling in-memory audio buffer (via MediaRecorder).
 * 3. Upon sustained voice detection (>= 1.5s), captures and packages an audio snippet (.webm)
 *    and uploads it to the backend as an archived audio evidence asset for faculty listening.
 */
export function useAudioVAD({
  examId,
  attemptId,
  audioStream,
  isActive,
  onVoiceDetected,
  minSpeechDurationMs = 1500,
  cooldownMs = 12000,
}: UseAudioVADOptions) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [currentDecibels, setCurrentDecibels] = useState(-100);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const speechStartRef = useRef<number | null>(null);
  const lastSpeechFrameRef = useRef<number>(0);
  const lastViolationTimeRef = useRef<number>(0);
  const baselineNoiseRef = useRef<number>(-45);
  const calibrationSamplesRef = useRef<number[]>([]);

  // Rolling audio recording buffer
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksBufferRef = useRef<Blob[]>([]);
  const isRecordingIncidentRef = useRef<boolean>(false);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onVoiceDetectedRef = useRef(onVoiceDetected);
  useEffect(() => {
    onVoiceDetectedRef.current = onVoiceDetected;
  }, [onVoiceDetected]);

  // Capture trailing audio and upload packaged audio clip
  const finalizeAndUploadAudioEvidence = useCallback(
    async (decibels: number, sustainedMs: number, speechRatio: number) => {
      if (!examId || !attemptId || audioChunksBufferRef.current.length === 0) {
        isRecordingIncidentRef.current = false;
        return;
      }

      try {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksBufferRef.current, { type: mimeType });

        if (audioBlob.size > 0) {
          await continuousProctoringService.uploadAudioEvidence(
            examId,
            attemptId,
            audioBlob,
            'VOICE_DETECTED',
            {
              decibels: Math.round(decibels),
              sustainedDurationMs: Math.round(sustainedMs),
              speechEnergyRatio: Math.round(speechRatio * 100) / 100,
              description: `Acoustic room voice clip recorded (${Math.round(decibels)} dB, sustained ${Math.round(sustainedMs / 100) / 10}s).`,
              recorded_at: new Date().toISOString(),
            }
          );
        }
      } catch (uploadErr) {
        console.debug('[AudioVAD] Audio evidence upload failed:', uploadErr);
      } finally {
        // Retain only the most recent chunk for continuous buffer continuity
        if (audioChunksBufferRef.current.length > 2) {
          audioChunksBufferRef.current = audioChunksBufferRef.current.slice(-2);
        }
        isRecordingIncidentRef.current = false;
      }
    },
    [examId, attemptId]
  );

  const dispatchVoiceViolation = useCallback(
    async (decibels: number, sustainedMs: number, speechRatio: number) => {
      const now = Date.now();
      if (now - lastViolationTimeRef.current < cooldownMs) {
        return;
      }
      lastViolationTimeRef.current = now;

      onVoiceDetectedRef.current?.({ decibels, sustainedMs, speechRatio });

      // 1. Immediately log violation telemetry to backend
      if (attemptId) {
        try {
          await attemptService.recordViolation(attemptId, {
            violation_type: 'VOICE_DETECTED' as any,
            timestamp: new Date().toISOString(),
            metadata: {
              decibels: Math.round(decibels),
              sustainedDurationMs: Math.round(sustainedMs),
              speechEnergyRatio: Math.round(speechRatio * 100) / 100,
              description: `Acoustic speech detected in candidate room (${Math.round(decibels)} dB, sustained ${Math.round(sustainedMs / 100) / 10}s).`,
            },
          });
        } catch (err) {
          console.debug('[AudioVAD] Violation dispatch error:', err);
        }
      }

      // 2. Trigger audio clip packaging (record another 2.5s of speech to catch full phrase)
      if (!isRecordingIncidentRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        isRecordingIncidentRef.current = true;
        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
        }
        recordingTimeoutRef.current = setTimeout(() => {
          finalizeAndUploadAudioEvidence(decibels, sustainedMs, speechRatio);
        }, 2500);
      }
    },
    [attemptId, cooldownMs, finalizeAndUploadAudioEvidence]
  );

  // Initialize MediaRecorder rolling buffer
  useEffect(() => {
    if (typeof window === 'undefined' || !isActive || !audioStream) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      mediaRecorderRef.current = null;
      audioChunksBufferRef.current = [];
      return;
    }

    const audioTracks = audioStream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks[0].enabled) {
      return;
    }

    try {
      if (typeof MediaRecorder !== 'undefined') {
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        }

        const audioOnlyStream = new MediaStream([audioTracks[0]]);
        const recorder = new MediaRecorder(audioOnlyStream, { mimeType });

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksBufferRef.current.push(e.data);
            // Maintain a rolling buffer of the last 6 chunks (approx 6 seconds) when not saving an incident
            if (!isRecordingIncidentRef.current && audioChunksBufferRef.current.length > 6) {
              audioChunksBufferRef.current.shift();
            }
          }
        };

        recorder.start(1000); // 1-second chunks
        mediaRecorderRef.current = recorder;
      }
    } catch (recErr) {
      console.warn('[AudioVAD] MediaRecorder initialization warning:', recErr);
    }

    return () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      mediaRecorderRef.current = null;
      audioChunksBufferRef.current = [];
      isRecordingIncidentRef.current = false;
    };
  }, [isActive, audioStream]);

  // AudioContext & AnalyserNode VAD processor
  useEffect(() => {
    if (!isActive || !audioStream) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      setIsVoiceActive(false);
      return;
    }

    const audioTracks = audioStream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks[0].enabled) {
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(audioStream);
      source.connect(analyser);
      sourceRef.current = source;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const sampleRate = ctx.sampleRate;
      const binWidth = sampleRate / analyser.fftSize;

      // Identify frequency bin indexes for human vocal range (85 Hz to 3000 Hz)
      const speechBinStart = Math.max(1, Math.floor(85 / binWidth));
      const speechBinEnd = Math.min(bufferLength - 1, Math.ceil(3000 / binWidth));
      const speechBinCount = Math.max(1, speechBinEnd - speechBinStart + 1);

      const processAudio = () => {
        if (!analyserRef.current || ctx.state === 'closed') return;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        analyserRef.current.getByteFrequencyData(dataArray);

        let totalEnergy = 0;
        let speechEnergy = 0;

        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i];
          totalEnergy += val;
          if (i >= speechBinStart && i <= speechBinEnd) {
            speechEnergy += val;
          }
        }

        // Compute RMS decibels over the human vocal band (85Hz - 3000Hz)
        const speechAvg = speechEnergy / speechBinCount;
        const db = speechAvg > 0 ? 20 * Math.log10(speechAvg / 255) : -100;
        setCurrentDecibels(Math.round(db));

        // Self-calibrating baseline noise for first 30 frames
        if (calibrationSamplesRef.current.length < 30) {
          calibrationSamplesRef.current.push(db);
          if (calibrationSamplesRef.current.length === 30) {
            const sum = calibrationSamplesRef.current.reduce((a, b) => a + b, 0);
            baselineNoiseRef.current = sum / 30;
          }
        }

        const speechRatio = totalEnergy > 0 ? speechEnergy / totalEnergy : 0;
        // Speech threshold: vocal-band energy above baseline and concentrated in speech band
        const thresholdDb = Math.max(-36, baselineNoiseRef.current + 8);
        const isCurrentlySpeech = db > thresholdDb && speechRatio > 0.25 && speechAvg > 8;

        const now = Date.now();
        if (isCurrentlySpeech) {
          lastSpeechFrameRef.current = now;
          if (!speechStartRef.current) {
            speechStartRef.current = now;
          } else {
            const elapsed = now - speechStartRef.current;
            if (elapsed >= minSpeechDurationMs) {
              setIsVoiceActive(true);
              dispatchVoiceViolation(db, elapsed, speechRatio);
            }
          }
        } else if (speechStartRef.current && now - lastSpeechFrameRef.current > 400) {
          // Only reset speech timer after >400ms of silence (allows natural pauses between words)
          speechStartRef.current = null;
          setIsVoiceActive(false);
        }

        animationFrameRef.current = requestAnimationFrame(processAudio);
      };

      animationFrameRef.current = requestAnimationFrame(processAudio);
    } catch (err) {
      console.warn('[AudioVAD] Initialization error:', err);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [audioStream, isActive, minSpeechDurationMs, dispatchVoiceViolation]);

  return {
    isVoiceActive,
    currentDecibels,
  };
}
