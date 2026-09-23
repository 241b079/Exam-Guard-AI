import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Mic,
  MicOff,
  Monitor,
  Volume2,
  VolumeX,
  AlertTriangle,
  User,
  Radio,
  Maximize2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AttemptMonitoringResponse } from '@/features/attempts';
import { StudentMediaTracks } from '../hooks/useWebRTCFaculty';

interface FacultyLiveMonitorCardProps {
  monitoring: AttemptMonitoringResponse;
  mediaTracks?: StudentMediaTracks;
}

export function FacultyLiveMonitorCard({
  monitoring,
  mediaTracks,
}: FacultyLiveMonitorCardProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'screen'>('camera');
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [audioPlaybackError, setAudioPlaybackError] = useState(false);

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Attach camera stream
  useEffect(() => {
    if (cameraVideoRef.current && mediaTracks?.cameraStream) {
      cameraVideoRef.current.srcObject = mediaTracks.cameraStream;
    }
  }, [mediaTracks?.cameraStream, activeTab]);

  // Attach screen stream
  useEffect(() => {
    if (screenVideoRef.current && mediaTracks?.screenStream) {
      screenVideoRef.current.srcObject = mediaTracks.screenStream;
    }
  }, [mediaTracks?.screenStream, activeTab]);

  // Attach audio stream
  useEffect(() => {
    if (audioRef.current && mediaTracks?.audioStream) {
      audioRef.current.srcObject = mediaTracks.audioStream;
      audioRef.current.muted = isAudioMuted;
      audioRef.current.play().catch(() => {
        setAudioPlaybackError(true);
      });
    }
  }, [mediaTracks?.audioStream, isAudioMuted]);

  const toggleAudio = () => {
    const nextMuted = !isAudioMuted;
    setIsAudioMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
      if (!nextMuted) {
        audioRef.current.play().catch(() => setAudioPlaybackError(true));
      }
    }
  };

  const connectionState = mediaTracks?.connectionState || 'disconnected';
  const hasCamera = Boolean(mediaTracks?.hasCamera && mediaTracks?.cameraStream);
  const hasMic = Boolean(mediaTracks?.hasMic);
  const hasScreen = Boolean(mediaTracks?.hasScreen && mediaTracks?.screenStream);

  const isExamSubmitted = monitoring.status === 'SUBMITTED';

  return (
    <Card className="p-5 space-y-4 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm flex flex-col justify-between">
      {/* Hidden audio element for student mic playback */}
      <audio ref={audioRef} autoPlay playsInline />

      {/* Candidate Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-stone-900 text-sm">{monitoring.student.name}</h3>
            {connectionState === 'connected' && !isExamSubmitted && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <Radio className="w-3 h-3 text-emerald-600 animate-pulse" /> LIVE
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500">
            {monitoring.student.roll_number ? `ID: ${monitoring.student.roll_number} • ` : ''}
            {monitoring.student.email}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={monitoring.status === 'SUBMITTED' ? 'success' : 'faculty'}>
            {monitoring.status}
          </Badge>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              monitoring.violation_count > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {monitoring.violation_count} {monitoring.violation_count === 1 ? 'Violation' : 'Violations'}
          </span>
        </div>
      </div>

      {/* Live Stream Viewport */}
      <div className="relative aspect-video w-full rounded-2xl bg-stone-950 overflow-hidden border border-stone-800 flex items-center justify-center">
        {/* Camera View */}
        <video
          ref={cameraVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${activeTab === 'camera' && hasCamera ? 'block' : 'hidden'}`}
        />

        {/* Screen View */}
        <video
          ref={screenVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-contain ${activeTab === 'screen' && hasScreen ? 'block' : 'hidden'}`}
        />

        {/* Placeholders when video unavailable */}
        {activeTab === 'camera' && !hasCamera && (
          <div className="text-center p-4 space-y-2 text-stone-500">
            <Camera className="w-8 h-8 mx-auto opacity-50 text-stone-400" />
            <span className="text-xs font-medium block">
              {isExamSubmitted
                ? 'Exam completed — stream closed'
                : connectionState === 'connecting'
                ? 'Connecting to webcam stream...'
                : 'Camera feed offline'}
            </span>
          </div>
        )}

        {activeTab === 'screen' && !hasScreen && (
          <div className="text-center p-4 space-y-2 text-stone-500">
            <Monitor className="w-8 h-8 mx-auto opacity-50 text-stone-400" />
            <span className="text-xs font-medium block">
              {isExamSubmitted
                ? 'Exam completed — screen share closed'
                : connectionState === 'connecting'
                ? 'Waiting for screen share track...'
                : 'Screen share stopped or offline'}
            </span>
          </div>
        )}

        {/* Floating View Switcher on Video */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-stone-900/80 backdrop-blur-sm p-1 rounded-xl border border-stone-700 text-xs">
          <button
            onClick={() => setActiveTab('camera')}
            className={`px-2 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
              activeTab === 'camera' ? 'bg-[#C25E1A] text-white shadow-sm' : 'text-stone-300 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> Webcam
          </button>
          <button
            onClick={() => setActiveTab('screen')}
            className={`px-2 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
              activeTab === 'screen' ? 'bg-[#C25E1A] text-white shadow-sm' : 'text-stone-300 hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" /> Screen
          </button>
        </div>

        {/* Floating Audio Control on Video */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <button
            onClick={toggleAudio}
            title={isAudioMuted ? 'Unmute Student Audio' : 'Mute Student Audio'}
            className={`p-2 rounded-xl backdrop-blur-sm border text-xs flex items-center gap-1.5 font-medium transition-all ${
              !isAudioMuted
                ? 'bg-emerald-600/90 text-white border-emerald-400 shadow-sm'
                : 'bg-stone-900/80 text-stone-300 border-stone-700 hover:text-white'
            }`}
          >
            {!isAudioMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{!isAudioMuted ? 'Mute Audio' : 'Listen In'}</span>
          </button>
        </div>
      </div>

      {/* Stream Status Indicators Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] flex flex-col gap-0.5">
          <span className="text-[10px] text-stone-500 font-semibold uppercase">Camera</span>
          <span
            className={`font-bold flex items-center gap-1 text-[11px] ${
              hasCamera ? 'text-emerald-700' : 'text-stone-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasCamera ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'
              }`}
            />
            {hasCamera ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        <div className="p-2 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] flex flex-col gap-0.5">
          <span className="text-[10px] text-stone-500 font-semibold uppercase">Microphone</span>
          <span
            className={`font-bold flex items-center gap-1 text-[11px] ${
              hasMic ? 'text-emerald-700' : 'text-stone-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasMic ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'
              }`}
            />
            {hasMic ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        <div className="p-2 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] flex flex-col gap-0.5">
          <span className="text-[10px] text-stone-500 font-semibold uppercase">Screen</span>
          <span
            className={`font-bold flex items-center gap-1 text-[11px] ${
              hasScreen ? 'text-emerald-700' : 'text-stone-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasScreen ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'
              }`}
            />
            {hasScreen ? 'SHARED' : 'STOPPED'}
          </span>
        </div>

        <div className="p-2 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] flex flex-col gap-0.5">
          <span className="text-[10px] text-stone-500 font-semibold uppercase">Connection</span>
          <span
            className={`font-bold flex items-center gap-1 text-[11px] ${
              connectionState === 'connected'
                ? 'text-emerald-700'
                : connectionState === 'connecting'
                ? 'text-amber-700'
                : 'text-stone-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionState === 'connected'
                  ? 'bg-emerald-500'
                  : connectionState === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-stone-400'
              }`}
            />
            {connectionState === 'connected'
              ? 'CONNECTED'
              : connectionState === 'connecting'
              ? 'RECONNECTING'
              : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Recent Violation Logs Accordion/List */}
      {monitoring.recent_violations && monitoring.recent_violations.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-[#EBE5DC]">
          <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider block">
            Recent Logged Violations:
          </span>
          <div className="space-y-1 max-h-24 overflow-y-auto text-xs">
            {monitoring.recent_violations.slice(0, 4).map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-stone-50 border border-stone-200 text-stone-700 text-[11px]"
              >
                <span className="font-mono font-semibold text-rose-700">{v.violation_type}</span>
                <span className="text-[10px] text-stone-400">
                  {new Date(v.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
