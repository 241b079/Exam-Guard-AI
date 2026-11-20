'use client';

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
  Minimize2,
  Zap,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AttemptMonitoringResponse } from '@/features/attempts';
import { StudentMediaTracks } from '../hooks/useWebRTCFaculty';

interface FacultyLiveMonitorCardProps {
  monitoring: AttemptMonitoringResponse;
  mediaTracks?: StudentMediaTracks;
  onFocusChange?: (studentId: string, isFocused: boolean) => void;
  onInspectInvestigation?: (attemptId: string) => void;
}

export function FacultyLiveMonitorCard({
  monitoring,
  mediaTracks,
  onFocusChange,
  onInspectInvestigation,
}: FacultyLiveMonitorCardProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'screen'>('camera');
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [audioPlaybackError, setAudioPlaybackError] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const toggleFocus = () => {
    const next = !isFocused;
    setIsFocused(next);
    onFocusChange?.(monitoring.student.id, next);
  };

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Attach camera stream
  useEffect(() => {
    const video = cameraVideoRef.current;
    if (video) {
      if (mediaTracks?.cameraStream) {
        video.muted = true;
        video.playsInline = true;
        if (video.srcObject !== mediaTracks.cameraStream) {
          video.srcObject = mediaTracks.cameraStream;
        }
        video.play().catch(() => {});
      } else {
        video.srcObject = null;
      }
    }
  }, [mediaTracks?.cameraStream, activeTab]);

  // Attach screen stream
  useEffect(() => {
    const video = screenVideoRef.current;
    if (video) {
      if (mediaTracks?.screenStream) {
        video.muted = true;
        video.playsInline = true;
        if (video.srcObject !== mediaTracks.screenStream) {
          video.srcObject = mediaTracks.screenStream;
        }
        video.play().catch(() => {});
      } else {
        video.srcObject = null;
      }
    }
  }, [mediaTracks?.screenStream, activeTab]);

  // Attach audio stream
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && mediaTracks?.audioStream) {
      if (audio.srcObject !== mediaTracks.audioStream) {
        audio.srcObject = mediaTracks.audioStream;
      }
      audio.muted = isAudioMuted;
      audio.play().catch(() => {
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

  const isExamSubmitted = monitoring.status === 'SUBMITTED';

  const isMediaSessionConnected =
    monitoring.media_session?.status === 'CONNECTED' ||
    monitoring.media_session?.status === 'MEDIA_READY' ||
    monitoring.media_session?.status === 'SCREEN_SHARE_READY';

  const connectionState =
    mediaTracks?.connectionState ||
    (isExamSubmitted
      ? 'disconnected'
      : isMediaSessionConnected
      ? 'connected'
      : 'connecting');

  const hasLiveCameraStream = Boolean(mediaTracks?.hasCamera && mediaTracks?.cameraStream);
  const hasLiveScreenStream = Boolean(mediaTracks?.hasScreen && mediaTracks?.screenStream);

  const hasCamera = Boolean(
    hasLiveCameraStream || monitoring.media_session?.camera_active
  );
  const hasMic = Boolean(
    mediaTracks?.hasMic || monitoring.media_session?.mic_active
  );
  const hasScreen = Boolean(
    hasLiveScreenStream || monitoring.media_session?.screen_active
  );

  // Derive real-time people count in candidate's exam area
  const latestViolation = monitoring.recent_violations?.[0];
  const violationFaceCount =
    latestViolation?.metadata_json?.face_count ??
    (latestViolation as any)?.face_count;

  const peopleCount =
    monitoring.face_count !== undefined
      ? monitoring.face_count
      : (violationFaceCount !== undefined
          ? violationFaceCount
          : (connectionState === 'connected' ? 1 : 0));

  return (
    <Card className={`p-5 space-y-4 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm flex flex-col justify-between transition-all ${
      isFocused ? 'lg:col-span-2 shadow-warm-lg ring-2 ring-cyan-500/30' : ''
    }`}>
      {/* Hidden audio element for student mic playback */}
      <audio ref={audioRef} autoPlay playsInline />

      {/* Candidate Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-stone-900 text-sm">{monitoring.student.name}</h3>
            {connectionState === 'connected' && !isExamSubmitted ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <Radio className="w-3 h-3 text-emerald-600 animate-pulse" /> LIVE
              </span>
            ) : !isExamSubmitted ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-400" /> Student Offline
              </span>
            ) : null}
          </div>
          <p className="text-xs text-stone-500">
            {monitoring.student.roll_number ? `ID: ${monitoring.student.roll_number} • ` : ''}
            {monitoring.student.email}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 justify-end">
          {mediaTracks?.isSfu ? (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 transition-all ${
                isFocused
                  ? 'bg-cyan-600 text-white border-cyan-700 shadow-sm'
                  : 'bg-cyan-50 text-cyan-900 border-cyan-300'
              }`}
              title="LiveKit SFU Dynacast: Ingests candidate video once and forwards dynamic low-bitrate thumbnails or 720p HD"
            >
              <Zap className="w-3 h-3 text-cyan-500 fill-current" />
              <span>SFU Dynacast {isFocused ? '• 720p HD' : '• 180p Low-BW'}</span>
            </span>
          ) : (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-300 flex items-center gap-1"
              title="Direct WebRTC Peer-to-Peer Mesh Fallback"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
              <span>P2P Mesh</span>
            </span>
          )}
          <span className="text-[11px] font-semibold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200">
            Att #{monitoring.attempt_number || 1}
          </span>
          <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            Rejoins: {monitoring.rejoin_count || 0}/{monitoring.max_rejoins ?? 2}
          </span>
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
          {typeof (monitoring as any).risk_score === 'number' && (
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                ((monitoring as any).risk_level === 'CRITICAL' || (monitoring as any).risk_score >= 75)
                  ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                  : ((monitoring as any).risk_level === 'HIGH' || (monitoring as any).risk_score >= 50)
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : ((monitoring as any).risk_level === 'MEDIUM' || (monitoring as any).risk_score >= 30)
                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
              title={`Dynamic Cheating Risk Score: ${(monitoring as any).risk_score.toFixed(1)}/100`}
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Risk: {(monitoring as any).risk_score.toFixed(0)}</span>
            </span>
          )}
          {(monitoring as any).investigation_status === 'DISQUALIFIED' ? (
            <Badge variant="danger">DISQUALIFIED</Badge>
          ) : (monitoring as any).investigation_status === 'VIOLATION_CONFIRMED' ? (
            <Badge variant="danger">VIOLATION</Badge>
          ) : (monitoring as any).investigation_status === 'CLEARED' ? (
            <Badge variant="success">CLEARED</Badge>
          ) : null}
          {onInspectInvestigation && (
            <button
              type="button"
              onClick={() => onInspectInvestigation(monitoring.attempt_id)}
              className="text-[11px] font-bold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs transition-colors"
              title="Open Post-Examination AI Investigation Dossier"
            >
              <FileText className="w-3 h-3 text-stone-500" />
              <span>Dossier</span>
            </button>
          )}
        </div>
      </div>

      {/* Identity Alert Indicator Banner if suspicious event occurred recently */}
      {(() => {
        const latest = monitoring.recent_violations?.[0];
        const isIdentityViolation =
          latest &&
          [
            'IDENTITY_MISMATCH',
            'MULTIPLE_PERSON',
            'MULTIPLE_PERSON_IDENTITY_MISMATCH',
            'TEMPORARY_ABSENCE',
            'NO_FACE',
            'STUDENT_RECOVERED',
          ].includes(latest.violation_type as string);

        if (!isIdentityViolation || !latest) return null;

        const isRecovered = (latest.violation_type as string) === 'STUDENT_RECOVERED';
        const isMultiPerson =
          (latest.violation_type as string) === 'MULTIPLE_PERSON' ||
          (latest.violation_type as string) === 'MULTIPLE_PERSON_IDENTITY_MISMATCH';

        const reportedCount =
          latest.metadata_json?.face_count ??
          (latest as any)?.face_count ??
          peopleCount;

        return (
          <div
            className={`flex items-center justify-between p-2 px-3 rounded-2xl border text-xs ${
              isRecovered
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-300 text-rose-800 animate-pulse'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-[11px]">
              <AlertTriangle className={`w-3.5 h-3.5 ${isRecovered ? 'text-emerald-600' : 'text-rose-600'}`} />
              <span>
                {isRecovered
                  ? 'Verified Student Returned'
                  : isMultiPerson
                  ? `Multiple People Detected: ${reportedCount && reportedCount >= 2 ? reportedCount : 2} People in Exam Area`
                  : (latest.violation_type as string) === 'UNAUTHORIZED_OBJECT'
                  ? `Prohibited Object: 📱 ${(() => {
                      const obj = (latest as any).metadata?.detected_object_name || (latest as any).metadata?.primary_object || (latest as any).primary_object || 'Cell Phone';
                      const u = String(obj).toUpperCase();
                      if (u.includes('CELL') || u.includes('PHONE') || u.includes('MOBILE')) return 'Cell Phone (Mobile)';
                      if (u.includes('BOOK') || u.includes('NOTE')) return 'Book / Study Material';
                      if (u.includes('LAPTOP') || u.includes('COMPUTER')) return 'Secondary Laptop / Device';
                      return String(obj).replace(/_/g, ' ');
                    })()}`
                  : latest.violation_type === 'TEMPORARY_ABSENCE' || latest.violation_type === 'NO_FACE'
                  ? 'Candidate Absent: 0 People Detected in Exam Area'
                  : `Suspicious: ${latest.violation_type.replace(/_/g, ' ')}`}
              </span>
            </div>
            <span className="text-[10px] font-mono opacity-80">
              {new Date(latest.timestamp).toLocaleTimeString()}
            </span>
          </div>
        );
      })()}

      {/* Live Stream Viewport */}
      <div className="relative aspect-video w-full rounded-2xl bg-stone-950 overflow-hidden border border-stone-800 flex items-center justify-center">
        {/* Floating Real-Time AI Badges */}
        {!isExamSubmitted && connectionState === 'connected' && (
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
            {/* Presence / People Count Badge */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl backdrop-blur-md text-xs font-bold border shadow-sm transition-all"
              style={{
                backgroundColor:
                  peopleCount === 1
                    ? 'rgba(6, 78, 59, 0.85)'
                    : peopleCount >= 2
                    ? 'rgba(159, 18, 57, 0.9)'
                    : 'rgba(120, 53, 15, 0.85)',
                borderColor:
                  peopleCount === 1
                    ? 'rgba(52, 211, 153, 0.4)'
                    : peopleCount >= 2
                    ? 'rgba(251, 113, 133, 0.6)'
                    : 'rgba(251, 191, 36, 0.4)',
                color: '#FFFFFF',
              }}
            >
              <User className="w-3.5 h-3.5" />
              <span>
                {peopleCount === 1
                  ? '1 Person (Candidate Verified)'
                  : peopleCount >= 2
                  ? `⚠️ ${peopleCount} People in Exam Area`
                  : '0 People (No Face Detected)'}
              </span>
            </div>

            {/* Looking Away Badge */}
            {monitoring.looking_away && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl backdrop-blur-md text-xs font-bold bg-amber-950/85 border border-amber-400/50 text-amber-200 shadow-sm animate-pulse">
                <span>⚠️ Looking Away {monitoring.yaw ? `(Yaw: ${monitoring.yaw}°)` : ''}</span>
              </div>
            )}

            {/* Unauthorized Object Badge */}
            {monitoring.detected_objects && monitoring.detected_objects.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl backdrop-blur-md text-xs font-bold bg-rose-950/90 border border-rose-400/60 text-rose-200 shadow-sm animate-pulse">
                <span>🚨 Prohibited: {monitoring.detected_objects.join(', ')}</span>
              </div>
            )}
          </div>
        )}
        {/* Camera View */}
        <video
          ref={cameraVideoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            el.muted = true;
            el.playsInline = true;
            el.play().catch(() => {});
          }}
          className={`w-full h-full object-cover ${activeTab === 'camera' && hasLiveCameraStream ? 'block' : 'hidden'}`}
        />

        {/* Screen View */}
        <video
          ref={screenVideoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            el.muted = true;
            el.playsInline = true;
            el.play().catch(() => {});
          }}
          className={`w-full h-full object-contain ${activeTab === 'screen' && hasLiveScreenStream ? 'block' : 'hidden'}`}
        />

        {/* Placeholders when video unavailable */}
        {activeTab === 'camera' && !hasLiveCameraStream && (
          <div className="text-center p-4 space-y-2 text-stone-500">
            <Camera className="w-8 h-8 mx-auto opacity-50 text-stone-400" />
            <span className="text-xs font-medium block">
              {isExamSubmitted
                ? 'Exam completed — stream closed'
                : connectionState === 'disconnected' || connectionState === 'failed'
                ? 'Student Offline'
                : connectionState === 'connecting'
                ? 'Connecting to webcam stream...'
                : 'Camera feed offline'}
            </span>
          </div>
        )}

        {activeTab === 'screen' && !hasLiveScreenStream && (
          <div className="text-center p-4 space-y-2 text-stone-500">
            <Monitor className="w-8 h-8 mx-auto opacity-50 text-stone-400" />
            <span className="text-xs font-medium block">
              {isExamSubmitted
                ? 'Exam completed — screen share closed'
                : connectionState === 'disconnected' || connectionState === 'failed'
                ? 'Student Offline'
                : connectionState === 'connecting'
                ? 'Waiting for screen share track...'
                : 'Screen share offline or mobile device'}
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
          <button
            onClick={toggleFocus}
            title={isFocused ? 'Switch back to low-bandwidth overview grid' : 'Focus candidate (scales SFU stream to 720p HD)'}
            className={`px-2 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
              isFocused ? 'bg-cyan-600 text-white shadow-sm' : 'text-stone-300 hover:text-white'
            }`}
          >
            {isFocused ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" /> Normal
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" /> Focus HD
              </>
            )}
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

      {/* Stream Status & Exam Area Indicators Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <div className="p-2 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] flex flex-col gap-0.5">
          <span className="text-[10px] text-stone-500 font-semibold uppercase">Exam Area</span>
          <span
            className={`font-bold flex items-center gap-1 text-[11px] ${
              peopleCount === 1
                ? 'text-emerald-700'
                : peopleCount >= 2
                ? 'text-rose-700'
                : 'text-amber-700'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                peopleCount === 1
                  ? 'bg-emerald-500'
                  : peopleCount >= 2
                  ? 'bg-rose-500 animate-pulse'
                  : 'bg-amber-500'
              }`}
            />
            {peopleCount === 1
              ? '1 Person (OK)'
              : peopleCount >= 2
              ? `${peopleCount} People (ALERT)`
              : '0 People (Absent)'}
          </span>
        </div>

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
                <span className="font-mono font-semibold text-rose-700">
                  {v.violation_type === 'UNAUTHORIZED_OBJECT'
                    ? `📱 ${(() => {
                        const obj = (v as any).metadata_json?.detected_object_name || (v as any).metadata_json?.primary_object || (v as any).metadata?.detected_object_name || (v as any).metadata?.primary_object || 'Cell Phone';
                        const u = String(obj).toUpperCase();
                        if (u.includes('CELL') || u.includes('PHONE') || u.includes('MOBILE')) return 'Cell Phone (Mobile)';
                        if (u.includes('BOOK') || u.includes('NOTE')) return 'Book / Study Material';
                        if (u.includes('LAPTOP') || u.includes('COMPUTER')) return 'Secondary Laptop';
                        return String(obj).replace(/_/g, ' ');
                      })()}`
                    : v.violation_type}
                </span>
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
