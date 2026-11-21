'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { attemptService } from '@/features/attempts/services/attemptService';

export interface UseAudioVADOptions {
  audioStream: MediaStream | null;
  attemptId?: string | null;
  isActive: boolean;
  onVoiceDetected?: (meta: { decibels: number; sustainedMs: number; speechRatio: number }) => void;
  minSpeechDurationMs?: number; // default 1500ms
  cooldownMs?: number; // default 12000ms
}

export function useAudioVAD({
  audioStream,
  attemptId,
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
  const lastViolationTimeRef = useRef<number>(0);
  const baselineNoiseRef = useRef<number>(-55);
  const calibrationSamplesRef = useRef<number[]>([]);

  const onVoiceDetectedRef = useRef(onVoiceDetected);
  useEffect(() => {
    onVoiceDetectedRef.current = onVoiceDetected;
  }, [onVoiceDetected]);

  const dispatchVoiceViolation = useCallback(
    async (decibels: number, sustainedMs: number, speechRatio: number) => {
      const now = Date.now();
      if (now - lastViolationTimeRef.current < cooldownMs) {
        return;
      }
      lastViolationTimeRef.current = now;

      onVoiceDetectedRef.current?.({ decibels, sustainedMs, speechRatio });

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
    },
    [attemptId, cooldownMs]
  );

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

      // Identify frequency bin indexes for human vocal range (85 Hz to 2500 Hz)
      const speechBinStart = Math.max(1, Math.floor(85 / binWidth));
      const speechBinEnd = Math.min(bufferLength - 1, Math.ceil(2500 / binWidth));

      const processAudio = () => {
        if (!analyserRef.current || ctx.state === 'closed') return;

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

        // Compute Root Mean Square (RMS) decibels
        const avg = totalEnergy / bufferLength;
        const db = avg > 0 ? 20 * Math.log10(avg / 255) : -100;
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
        // Speech threshold: energy above baseline and high concentration in speech band
        const thresholdDb = Math.max(-42, baselineNoiseRef.current + 12);
        const isCurrentlySpeech = db > thresholdDb && speechRatio > 0.45 && avg > 12;

        const now = Date.now();
        if (isCurrentlySpeech) {
          if (!speechStartRef.current) {
            speechStartRef.current = now;
          } else {
            const elapsed = now - speechStartRef.current;
            if (elapsed >= minSpeechDurationMs) {
              setIsVoiceActive(true);
              dispatchVoiceViolation(db, elapsed, speechRatio);
            }
          }
        } else {
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
