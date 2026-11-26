'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  UserX,
  Users,
  CheckCircle2,
  Clock,
  Eye,
  Check,
  X,
  HelpCircle,
  RefreshCw,
  Filter,
  Camera,
  Calendar,
  UserCheck,
  ChevronLeft,
  ArrowRight,
  Layers,
  User,
  Smartphone,
  ExternalLink,
  History,
  Monitor,
  Mic,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  continuousProctoringService,
  ProctoringEventItem,
  ReviewStatus,
} from '../services/continuousProctoringService';

interface FacultyEvidenceGalleryProps {
  examId: string;
  examTitle?: string;
  autoRefreshIntervalMs?: number;
}

export type GroupingMode = 'ATTEMPT' | 'STUDENT' | 'TIMELINE';

export interface AttemptCluster {
  attemptId: string;
  examId: string;
  examTitle: string;
  attemptNumber: number;
  attemptStatus: string;
  startedAt: string;
  submittedAt: string | null;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentRollNumber: string | null;
  events: ProctoringEventItem[];
  latestEvent: ProctoringEventItem;
  latestEvidenceEvent: ProctoringEventItem | null;
  pendingCount: number;
  confirmedCount: number;
  dismissedCount: number;
  falsePosCount: number;
  resolvedCount: number;
  eventTypes: Set<string>;
}

export interface StudentHistoryCluster {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentRollNumber: string | null;
  attempts: AttemptCluster[];
  totalIncidents: number;
  pendingCount: number;
  confirmedCount: number;
  resolvedCount: number;
  latestEvent: ProctoringEventItem;
}

export function FacultyEvidenceGallery({
  examId,
  examTitle,
  autoRefreshIntervalMs = 10000,
}: FacultyEvidenceGalleryProps) {
  const [events, setEvents] = useState<ProctoringEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // View Mode: 'ATTEMPT' (default: Group by Exam Attempt), 'STUDENT' (Group by Student), or 'TIMELINE' (flat)
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('ATTEMPT');

  // Drill-down selection state
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Selected event for full inspection modal
  const [inspectingEvent, setInspectingEvent] = useState<ProctoringEventItem | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [isUpdatingReview, setIsUpdatingReview] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Record<string, boolean>>({});

  const formatDateTime = (dateStr?: string | null): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatTimeOnly = (dateStr?: string | null): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const fetchEvents = useCallback(async () => {
    try {
      setError(null);
      const res = await continuousProctoringService.listProctoringEvents(examId, {
        reviewStatus: selectedStatus === 'ALL' ? undefined : selectedStatus,
        eventType: selectedEventType === 'ALL' ? undefined : selectedEventType,
        limit: 300,
      });
      setEvents(res.events || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch proctoring evidence');
    } finally {
      setIsLoading(false);
    }
  }, [examId, selectedStatus, selectedEventType]);

  useEffect(() => {
    setIsLoading(true);
    fetchEvents();
  }, [fetchEvents]);

  // Periodic polling for new evidence (pause when inspection modal is open)
  useEffect(() => {
    if (!autoRefreshIntervalMs || inspectingEvent) return;
    const interval = setInterval(() => {
      fetchEvents();
    }, autoRefreshIntervalMs);
    return () => clearInterval(interval);
  }, [autoRefreshIntervalMs, fetchEvents, inspectingEvent]);

  const handleReviewAction = async (
    eventId: string,
    status: ReviewStatus,
    comment?: string
  ) => {
    setIsUpdatingReview(true);
    try {
      const updated = await continuousProctoringService.reviewEvent(
        eventId,
        status,
        comment
      );
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, ...updated } : e))
      );
      if (inspectingEvent?.id === eventId) {
        setInspectingEvent((prev) => (prev ? { ...prev, ...updated } : null));
      }
    } catch (err: any) {
      alert(`Failed to update review status: ${err.message}`);
    } finally {
      setIsUpdatingReview(false);
    }
  };

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        (e.student_name && e.student_name.toLowerCase().includes(term)) ||
        (e.student_email && e.student_email.toLowerCase().includes(term)) ||
        (e.student_roll_number && e.student_roll_number.toLowerCase().includes(term)) ||
        (e.exam_title && e.exam_title.toLowerCase().includes(term)) ||
        e.event_type.toLowerCase().includes(term) ||
        (e.exam_attempt_id && e.exam_attempt_id.toLowerCase().includes(term))
      );
    });
  }, [events, searchTerm]);

  // Group filtered events into independent Exam Attempt clusters (Mode 1 - default)
  const attemptClusters = useMemo<AttemptCluster[]>(() => {
    const map = new Map<string, AttemptCluster>();

    filteredEvents.forEach((ev) => {
      const attemptKey =
        ev.exam_attempt_id ||
        `unassigned_${ev.student_id || 'unknown'}_${ev.exam_id || 'unknown'}`;

      let cluster = map.get(attemptKey);
      if (!cluster) {
        cluster = {
          attemptId: attemptKey,
          examId: ev.exam_id,
          examTitle: ev.exam_title || examTitle || 'Examination',
          attemptNumber: ev.attempt_number || 1,
          attemptStatus: ev.attempt_status || (ev.attempt_submitted_at ? 'SUBMITTED' : 'IN_PROGRESS'),
          startedAt: ev.attempt_started_at || ev.detected_at,
          submittedAt: ev.attempt_submitted_at || null,
          studentId: ev.student_id,
          studentName: ev.student_name || 'Candidate',
          studentEmail: ev.student_email || '',
          studentRollNumber: ev.student_roll_number || null,
          events: [],
          latestEvent: ev,
          latestEvidenceEvent: ev.evidence_url ? ev : null,
          pendingCount: 0,
          confirmedCount: 0,
          dismissedCount: 0,
          falsePosCount: 0,
          resolvedCount: 0,
          eventTypes: new Set<string>(),
        };
        map.set(attemptKey, cluster);
      }

      cluster.events.push(ev);
      cluster.eventTypes.add(ev.event_type);

      if (ev.review_status === 'PENDING') cluster.pendingCount++;
      else if (ev.review_status === 'CONFIRMED') cluster.confirmedCount++;
      else if (ev.review_status === 'DISMISSED') {
        cluster.dismissedCount++;
        cluster.resolvedCount++;
      } else if (ev.review_status === 'FALSE_POSITIVE') {
        cluster.falsePosCount++;
        cluster.resolvedCount++;
      }

      // Track latest event by detected timestamp
      if (new Date(ev.detected_at) > new Date(cluster.latestEvent.detected_at)) {
        cluster.latestEvent = ev;
      }
      if (ev.evidence_url) {
        if (
          !cluster.latestEvidenceEvent ||
          new Date(ev.detected_at) > new Date(cluster.latestEvidenceEvent.detected_at)
        ) {
          cluster.latestEvidenceEvent = ev;
        }
      }
    });

    // Sort attempt clusters by latest incident timestamp descending
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.latestEvent.detected_at).getTime() -
        new Date(a.latestEvent.detected_at).getTime()
    );
  }, [filteredEvents, examTitle]);

  // Group attempts by student for Mode 2: "Group by Student"
  const studentHistoryClusters = useMemo<StudentHistoryCluster[]>(() => {
    const studentMap = new Map<string, StudentHistoryCluster>();

    attemptClusters.forEach((att) => {
      const studentKey = att.studentId || att.studentEmail || 'unknown';
      let stud = studentMap.get(studentKey);
      if (!stud) {
        stud = {
          studentId: att.studentId,
          studentName: att.studentName,
          studentEmail: att.studentEmail,
          studentRollNumber: att.studentRollNumber,
          attempts: [],
          totalIncidents: 0,
          pendingCount: 0,
          confirmedCount: 0,
          resolvedCount: 0,
          latestEvent: att.latestEvent,
        };
        studentMap.set(studentKey, stud);
      }

      stud.attempts.push(att);
      stud.totalIncidents += att.events.length;
      stud.pendingCount += att.pendingCount;
      stud.confirmedCount += att.confirmedCount;
      stud.resolvedCount += att.resolvedCount;

      if (new Date(att.latestEvent.detected_at) > new Date(stud.latestEvent.detected_at)) {
        stud.latestEvent = att.latestEvent;
      }
    });

    // Sort student attempts chronologically (most recent attempt first)
    studentMap.forEach((stud) => {
      stud.attempts.sort((a, b) => b.attemptNumber - a.attemptNumber);
    });

    return Array.from(studentMap.values()).sort(
      (a, b) =>
        new Date(b.latestEvent.detected_at).getTime() -
        new Date(a.latestEvent.detected_at).getTime()
    );
  }, [attemptClusters]);

  // Active attempt cluster if faculty drilled into a specific attempt
  const activeAttemptCluster = useMemo(() => {
    if (!selectedAttemptId) return null;
    return attemptClusters.find((a) => a.attemptId === selectedAttemptId) || null;
  }, [selectedAttemptId, attemptClusters]);

  // Active student history cluster if faculty drilled into a specific student's examination history
  const activeStudentCluster = useMemo(() => {
    if (!selectedStudentId) return null;
    return studentHistoryClusters.find((s) => s.studentId === selectedStudentId) || null;
  }, [selectedStudentId, studentHistoryClusters]);

  const formatObjectName = (obj?: string | null): string => {
    if (!obj) return 'Cell Phone (Mobile)';
    const clean = obj.replace(/^DETECTED:\s*/i, '').trim();
    const upper = clean.toUpperCase();
    if (upper.includes('CELL') || upper.includes('PHONE') || upper.includes('MOBILE')) {
      return 'Cell Phone (Mobile)';
    }
    if (upper.includes('BOOK') || upper.includes('NOTE')) {
      return 'Book / Study Material';
    }
    if (upper.includes('LAPTOP') || upper.includes('COMPUTER')) {
      return 'Secondary Laptop / Device';
    }
    return clean.replace(/_/g, ' ');
  };

  const getEventBadge = (type: string, ev?: ProctoringEventItem) => {
    switch (type) {
      case 'UNAUTHORIZED_OBJECT': {
        const objName = formatObjectName(
          ev?.metadata_json?.detected_object_name ||
          ev?.metadata_json?.primary_object ||
          ev?.detected_identity_status
        );
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <Smartphone className="w-3.5 h-3.5 text-rose-600" /> {objName}
          </span>
        );
      }
      case 'SCREEN_SNAPSHOT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Monitor className="w-3.5 h-3.5 text-blue-600" /> Screen Snapshot
          </span>
        );
      case 'VOICE_DETECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            <Mic className="w-3.5 h-3.5 text-amber-700" /> Room Voice Detected
          </span>
        );
      case 'MULTIPLE_VOICES_DETECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300">
            <Volume2 className="w-3.5 h-3.5 text-red-600" /> Multiple Voices
          </span>
        );
      case 'LIVENESS_FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> Liveness Failed (Spoof)
          </span>
        );
      case 'VIRTUAL_CAMERA_DETECTED':
      case 'MULTIPLE_DISPLAYS_DETECTED':
      case 'VIRTUAL_MACHINE_DETECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-800 border border-stone-300">
            <Monitor className="w-3.5 h-3.5 text-stone-600" /> {type.replace(/_/g, ' ')}
          </span>
        );
      case 'IDENTITY_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <UserX className="w-3.5 h-3.5 text-rose-600" /> Identity Mismatch
          </span>
        );
      case 'MULTIPLE_PERSON_IDENTITY_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 animate-pulse">
            <Users className="w-3.5 h-3.5 text-purple-600" /> Multi-Person + Mismatch
          </span>
        );
      case 'MULTIPLE_PERSON':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <Users className="w-3.5 h-3.5 text-amber-700" /> Multiple Person
          </span>
        );
      case 'TEMPORARY_ABSENCE':
      case 'NO_FACE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Temporary Absence
          </span>
        );
      case 'RECOVERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Student Recovered
          </span>
        );
      case 'FULLSCREEN_EXIT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-800 border border-stone-300">
            Fullscreen Exit
          </span>
        );
      case 'LOOKING_AWAY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            Looking Away
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-800">
            {type.replace(/_/g, ' ')}
          </span>
        );
    }
  };

  const getStatusBadge = (status: ReviewStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Pending Review
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            Confirmed Misconduct
          </span>
        );
      case 'FALSE_POSITIVE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            False Positive
          </span>
        );
      case 'DISMISSED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-100 text-stone-600 border border-stone-200">
            Dismissed
          </span>
        );
    }
  };

  // Render individual incident card inside an attempt's timeline
  const renderIncidentCard = (ev: ProctoringEventItem) => {
    const hasEvidence = Boolean(ev.evidence_url);
    const dateFormatted = formatDateTime(ev.detected_at);

    return (
      <Card
        key={ev.id}
        className="p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm flex flex-col justify-between space-y-4 hover:border-stone-400 transition-all w-full"
      >
        {/* Card Top: Student, Attempt Context & Status */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-stone-900 text-sm">
                  {ev.student_name || 'Candidate'}
                </h4>
                {ev.attempt_number && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                    Attempt #{ev.attempt_number}
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500">
                {ev.student_roll_number ? `ID: ${ev.student_roll_number} • ` : ''}
                {ev.student_email || ev.student_id}
              </p>
            </div>
            {getStatusBadge(ev.review_status)}
          </div>

          <div className="flex items-center justify-between gap-2">
            {getEventBadge(ev.event_type, ev)}
            <span className="text-[11px] font-mono text-stone-400">
              {dateFormatted}
            </span>
          </div>
        </div>

        {/* Evidence Thumbnail / Snapshot Container */}
        <div className="relative aspect-video w-full rounded-2xl bg-stone-950 overflow-hidden border border-stone-800 flex items-center justify-center group">
          {hasEvidence && !failedImageIds[ev.id] ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={continuousProctoringService.getEvidenceImageUrl(ev.id)}
                alt={`Evidence for ${ev.event_type}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                onError={() => setFailedImageIds((prev) => ({ ...prev, [ev.id]: true }))}
              />
              <button
                onClick={() => setInspectingEvent(ev)}
                className="absolute inset-0 bg-stone-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 text-white font-medium text-xs transition-opacity"
              >
                <Eye className="w-4 h-4" /> View Full Evidence
              </button>
            </>
          ) : (
            <div className="text-center p-4 text-stone-500 space-y-1">
              <Camera className="w-6 h-6 mx-auto opacity-40 text-stone-400" />
              <span className="text-[11px] block">No visual snapshot attached</span>
            </div>
          )}
        </div>

        {/* Details Breakdown */}
        <div className="grid grid-cols-3 gap-2 text-[11px] bg-stone-50 p-2.5 rounded-xl border border-stone-200">
          <div>
            <span className="text-[10px] text-stone-400 block uppercase">
              {ev.event_type === 'UNAUTHORIZED_OBJECT' ? 'Detected' : 'Duration'}
            </span>
            <span className="font-semibold text-stone-700 truncate block">
              {ev.event_type === 'UNAUTHORIZED_OBJECT'
                ? formatObjectName(
                    ev.metadata_json?.detected_object_name ||
                    ev.metadata_json?.primary_object ||
                    ev.detected_identity_status
                  )
                : ev.duration ? `${ev.duration}s` : '< 3s'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-stone-400 block uppercase">Faces</span>
            <span className="font-semibold text-stone-700">{ev.face_count}</span>
          </div>
          <div>
            <span className="text-[10px] text-stone-400 block uppercase">Confidence</span>
            <span className="font-semibold text-stone-700">
              {ev.confidence !== null && ev.confidence !== undefined
                ? `${Math.round(ev.confidence * 100)}%`
                : 'N/A'}
            </span>
          </div>
        </div>

        {/* Review Notes / Reviewer attribution */}
        {ev.review_comment && (
          <p className="text-xs italic text-stone-600 bg-amber-50/70 p-2 rounded-xl border border-amber-200/60">
            &quot;{ev.review_comment}&quot; — {ev.reviewed_by_name || 'Faculty'}
          </p>
        )}

        {/* Card Actions: Faculty Review Buttons */}
        <div className="pt-2 border-t border-[#EBE5DC] flex flex-wrap items-center gap-1.5 justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInspectingEvent(ev)}
            className="text-xs gap-1 py-1 px-2.5 h-8"
          >
            <Eye className="w-3.5 h-3.5" /> Inspect
          </Button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handleReviewAction(ev.id, 'CONFIRMED')}
              disabled={isUpdatingReview}
              title="Confirm Academic Misconduct"
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => handleReviewAction(ev.id, 'FALSE_POSITIVE')}
              disabled={isUpdatingReview}
              title="Mark as False Positive (e.g. poor lighting, motion blur)"
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              False Pos
            </button>
            <button
              onClick={() => handleReviewAction(ev.id, 'DISMISSED')}
              disabled={isUpdatingReview}
              title="Dismiss Incident"
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6 w-full">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm w-full">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#C25E1A]" />
            <h3 className="font-serif font-bold text-lg text-stone-900">
              Proctoring Evidence & Identity Timeline
            </h3>
            <span className="text-xs bg-stone-100 font-semibold text-stone-700 px-2 py-0.5 rounded-full">
              {attemptClusters.length} {attemptClusters.length === 1 ? 'Exam Attempt' : 'Exam Attempts'} •{' '}
              {filteredEvents.length} {filteredEvents.length === 1 ? 'Incident' : 'Incidents'}
            </span>
          </div>
          <p className="text-xs text-stone-500">
            Recorded proctoring evidence and verified identity audit records, strictly separated per examination attempt.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchEvents}
            disabled={isLoading}
            className="gap-1.5 text-xs h-9 px-3"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#C25E1A]' : ''}`} />
            {isLoading ? 'Refreshing...' : 'Refresh Evidence'}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={fetchEvents} className="text-xs h-7 py-0 px-2">
            Retry
          </Button>
        </div>
      )}

      {/* Filter & View Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#FAF7F2] border border-[#EBE5DC] rounded-2xl text-xs w-full">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-stone-500 font-medium">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </div>

          <input
            type="text"
            placeholder="Search candidate name, email, exam, roll number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-stone-300 bg-white text-stone-900 text-xs w-72 focus:outline-none focus:ring-1 focus:ring-[#C25E1A]"
          />

          <div className="flex items-center gap-1">
            <span className="text-stone-500">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-stone-300 bg-white text-stone-800 text-xs focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Review</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="DISMISSED">Dismissed</option>
              <option value="FALSE_POSITIVE">False Positive</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-stone-500">Event:</span>
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-stone-300 bg-white text-stone-800 text-xs focus:outline-none"
            >
              <option value="ALL">All Event Types</option>
              <option value="IDENTITY_MISMATCH">Identity Mismatch</option>
              <option value="MULTIPLE_PERSON_IDENTITY_MISMATCH">Multi-Person + Mismatch</option>
              <option value="MULTIPLE_PERSON">Multiple Person</option>
              <option value="TEMPORARY_ABSENCE">Temporary Absence</option>
              <option value="UNAUTHORIZED_OBJECT">Prohibited Material</option>
              <option value="LOOKING_AWAY">Looking Away</option>
              <option value="FULLSCREEN_EXIT">Fullscreen Exit</option>
              <option value="RECOVERED">Recovered</option>
            </select>
          </div>
        </div>

        {/* View Mode Toggle: Group by Exam Attempt (default) vs Group by Student vs All Incidents */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-200">
          <button
            onClick={() => {
              setGroupingMode('ATTEMPT');
              setSelectedAttemptId(null);
              setSelectedStudentId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              groupingMode === 'ATTEMPT' && !selectedAttemptId
                ? 'bg-[#C25E1A] text-white shadow-warm-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Group by Exam Attempt ({attemptClusters.length})
          </button>
          <button
            onClick={() => {
              setGroupingMode('STUDENT');
              setSelectedAttemptId(null);
              setSelectedStudentId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              groupingMode === 'STUDENT' && !selectedStudentId
                ? 'bg-[#C25E1A] text-white shadow-warm-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Group by Student ({studentHistoryClusters.length})
          </button>
          <button
            onClick={() => {
              setGroupingMode('TIMELINE');
              setSelectedAttemptId(null);
              setSelectedStudentId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              groupingMode === 'TIMELINE'
                ? 'bg-[#C25E1A] text-white shadow-warm-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            All Incidents ({filteredEvents.length})
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {filteredEvents.length === 0 ? (
        <Card className="p-12 text-center space-y-3 bg-white border border-[#EBE5DC] rounded-3xl w-full">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <h4 className="font-serif font-bold text-stone-800 text-base">
            No Suspicious Proctoring Incidents Found
          </h4>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            {events.length === 0
              ? 'All candidate attempts for this examination have maintained verified identity integrity without confirmed anomalies or prohibited materials.'
              : 'No proctoring incidents match your selected filters.'}
          </p>
        </Card>
      ) : selectedAttemptId && activeAttemptCluster ? (
        /* ─────────────────────────────────────────────────────────────
           DEDICATED ATTEMPT EVIDENCE & TIMELINE VIEW
           ───────────────────────────────────────────────────────────── */
        <div className="space-y-5 animate-in fade-in duration-200 w-full">
          {/* Sub-Header & Attempt Context Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm-sm w-full">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedAttemptId(null)}
                className="px-3.5 py-2 rounded-2xl border border-stone-300 bg-[#FAF7F2] hover:bg-stone-100 text-stone-800 text-xs font-bold flex items-center gap-1.5 shadow-warm-xs transition-all hover:-translate-x-0.5"
              >
                <ChevronLeft className="w-4 h-4 text-[#C25E1A]" />
                {selectedStudentId ? 'Back to Student History' : 'Back to All Attempts'}
              </button>

              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h4 className="font-serif font-bold text-base text-stone-900">
                    {activeAttemptCluster.studentName}
                  </h4>
                  <span className="text-xs bg-[#C25E1A]/10 text-[#C25E1A] font-bold px-2.5 py-0.5 rounded-full border border-[#C25E1A]/20">
                    {activeAttemptCluster.examTitle} • Attempt #{activeAttemptCluster.attemptNumber}
                  </span>
                  <Badge variant={activeAttemptCluster.attemptStatus === 'SUBMITTED' ? 'success' : 'faculty'}>
                    {activeAttemptCluster.attemptStatus}
                  </Badge>
                </div>
                <p className="text-xs text-stone-500 flex items-center gap-2 flex-wrap">
                  {activeAttemptCluster.studentRollNumber ? (
                    <span>ID: <strong>{activeAttemptCluster.studentRollNumber}</strong> • </span>
                  ) : null}
                  <span>{activeAttemptCluster.studentEmail}</span>
                  <span>• Started: {formatDateTime(activeAttemptCluster.startedAt)}</span>
                  {activeAttemptCluster.submittedAt && (
                    <span>• Completed: {formatDateTime(activeAttemptCluster.submittedAt)}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Quick Status Pill Breakdown */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-800 border border-stone-300">
                {activeAttemptCluster.events.length} Incidents
              </span>
              {activeAttemptCluster.pendingCount > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  {activeAttemptCluster.pendingCount} Pending Review
                </span>
              )}
              {activeAttemptCluster.confirmedCount > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
                  {activeAttemptCluster.confirmedCount} Confirmed Misconduct
                </span>
              )}
              {activeAttemptCluster.resolvedCount > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {activeAttemptCluster.resolvedCount} Resolved
                </span>
              )}
            </div>
          </div>

          {/* Grid of incidents for this attempt */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 w-full">
            {activeAttemptCluster.events.map(renderIncidentCard)}
          </div>
        </div>
      ) : selectedStudentId && activeStudentCluster ? (
        /* ─────────────────────────────────────────────────────────────
           DEDICATED STUDENT EXAMINATION HISTORY DRILL-DOWN VIEW
           ───────────────────────────────────────────────────────────── */
        <div className="space-y-5 animate-in fade-in duration-200 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm-sm w-full">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedStudentId(null)}
                className="px-3.5 py-2 rounded-2xl border border-stone-300 bg-[#FAF7F2] hover:bg-stone-100 text-stone-800 text-xs font-bold flex items-center gap-1.5 shadow-warm-xs transition-all hover:-translate-x-0.5"
              >
                <ChevronLeft className="w-4 h-4 text-[#C25E1A]" />
                Back to All Students
              </button>

              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="font-serif font-bold text-base text-stone-900">
                    {activeStudentCluster.studentName}’s Examination History
                  </h4>
                  <span className="text-xs bg-[#C25E1A]/10 text-[#C25E1A] font-bold px-2.5 py-0.5 rounded-full border border-[#C25E1A]/20">
                    {activeStudentCluster.attempts.length} {activeStudentCluster.attempts.length === 1 ? 'Attempt' : 'Attempts'}
                  </span>
                </div>
                <p className="text-xs text-stone-500">
                  {activeStudentCluster.studentRollNumber ? `Roll No: ${activeStudentCluster.studentRollNumber} • ` : ''}
                  {activeStudentCluster.studentEmail}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-300">
                {activeStudentCluster.totalIncidents} Total Incidents
              </span>
            </div>
          </div>

          {/* List of each individual attempt for this student */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
            {activeStudentCluster.attempts.map((att) => {
              const hasEvidence = Boolean(att.latestEvidenceEvent?.evidence_url);
              const latestDateStr = formatDateTime(att.latestEvent.detected_at);

              return (
                <Card
                  key={att.attemptId}
                  onClick={() => setSelectedAttemptId(att.attemptId)}
                  className="p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm hover:shadow-warm-md hover:border-[#C25E1A]/60 transition-all cursor-pointer flex flex-col justify-between space-y-4 group w-full"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#C25E1A] text-white">
                            Attempt #{att.attemptNumber}
                          </span>
                          <span className="text-xs font-semibold text-stone-600 truncate max-w-[150px]">
                            {att.examTitle}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 mt-1">
                          Started: {formatDateTime(att.startedAt)}
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FAF7F2] text-stone-700 border border-[#EBE5DC]">
                        {att.events.length} {att.events.length === 1 ? 'Incident' : 'Incidents'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span className="flex items-center gap-1 font-medium text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-stone-400" />
                        Latest: {latestDateStr}
                      </span>
                      {att.pendingCount > 0 ? (
                        <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[11px]">
                          {att.pendingCount} Pending
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                          All Reviewed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Evidence Thumbnail */}
                  <div className="relative aspect-video w-full rounded-2xl bg-stone-950 overflow-hidden border border-stone-800 flex items-center justify-center">
                    {hasEvidence && att.latestEvidenceEvent && !failedImageIds[att.latestEvidenceEvent.id] ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={continuousProctoringService.getEvidenceImageUrl(att.latestEvidenceEvent.id)}
                          alt={`Latest capture for Attempt #${att.attemptNumber}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={() => {
                            if (att.latestEvidenceEvent) {
                              const errId = att.latestEvidenceEvent.id;
                              setFailedImageIds((prev) => ({ ...prev, [errId]: true }));
                            }
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-transparent flex items-end justify-between p-3">
                          <span className="text-[11px] font-mono text-white/95 flex items-center gap-1.5">
                            <Camera className="w-3 h-3 text-amber-400" />
                            Latest Frame
                          </span>
                          {att.events.length > 1 && (
                            <span className="text-[10px] font-bold bg-stone-900/90 text-amber-300 px-2 py-0.5 rounded-full border border-stone-700 backdrop-blur-xs">
                              +{att.events.length - 1} more
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-4 text-stone-500 space-y-1">
                        <Camera className="w-6 h-6 mx-auto opacity-40 text-stone-400" />
                        <span className="text-[11px] block">No visual snapshots</span>
                      </div>
                    )}
                  </div>

                  {/* Status Breakdown Grid */}
                  <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                    <div className={`p-1.5 rounded-xl border ${att.pendingCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-800 font-bold' : 'bg-stone-50 border-stone-200 text-stone-500'}`}>
                      <span>{att.pendingCount} Pending</span>
                    </div>
                    <div className={`p-1.5 rounded-xl border ${att.confirmedCount > 0 ? 'bg-rose-50 border-rose-200 text-rose-800 font-bold' : 'bg-stone-50 border-stone-200 text-stone-500'}`}>
                      <span>{att.confirmedCount} Confirmed</span>
                    </div>
                    <div className="p-1.5 rounded-xl border bg-stone-50 border-stone-200 text-stone-500">
                      <span>{att.resolvedCount} Resolved</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#EBE5DC] flex items-center justify-between text-xs text-[#C25E1A] font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>Inspect Attempt #{att.attemptNumber} Timeline</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : groupingMode === 'ATTEMPT' ? (
        /* ─────────────────────────────────────────────────────────────
           MODE 1: GROUP BY EXAM ATTEMPT (DEFAULT REQUIRED VIEW)
           Each examination attempt is an independent card with full context
           ───────────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
          {attemptClusters.map((cluster) => {
            const hasEvidence = Boolean(cluster.latestEvidenceEvent?.evidence_url);
            const latestDateStr = formatDateTime(cluster.latestEvent.detected_at);
            const examDateStr = formatDateTime(cluster.startedAt);

            return (
              <Card
                key={cluster.attemptId}
                onClick={() => setSelectedAttemptId(cluster.attemptId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedAttemptId(cluster.attemptId);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Open proctoring evidence for ${cluster.studentName}, Attempt ${cluster.attemptNumber}`}
                className="p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm hover:shadow-warm-md hover:border-[#C25E1A]/60 transition-all cursor-pointer flex flex-col justify-between space-y-4 group w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C25E1A]"
              >
                {/* Attempt Card Header: Student Info & Attempt Context */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC] flex items-center justify-center text-stone-800 font-bold text-sm shadow-warm-xs group-hover:bg-[#C25E1A]/10 group-hover:text-[#C25E1A] transition-colors shrink-0">
                        {cluster.studentName ? cluster.studentName.charAt(0).toUpperCase() : 'C'}
                      </div>
                      <div>
                        <h4 className="font-bold text-stone-900 text-sm group-hover:text-[#C25E1A] transition-colors flex items-center gap-2">
                          {cluster.studentName}
                        </h4>
                        <p className="text-xs text-stone-500">
                          {cluster.studentRollNumber ? `ID: ${cluster.studentRollNumber} • ` : ''}
                          {cluster.studentEmail}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#C25E1A] text-white shadow-warm-xs">
                        Attempt #{cluster.attemptNumber}
                      </span>
                      <span className="text-[10px] font-semibold text-stone-500">
                        {cluster.attemptStatus}
                      </span>
                    </div>
                  </div>

                  {/* Examination Context & Date */}
                  <div className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC] space-y-1 text-xs">
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-stone-700 font-semibold truncate max-w-[200px]">
                        📖 {cluster.examTitle}
                      </span>
                      <span className="text-stone-500 font-bold">
                        {cluster.events.length} {cluster.events.length === 1 ? 'Incident' : 'Incidents'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-stone-500">
                      <span>Exam Date: {examDateStr}</span>
                      {cluster.submittedAt ? (
                        <span className="text-emerald-700 font-medium">Completed</span>
                      ) : (
                        <span className="text-amber-700 font-medium">Active Session</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span className="flex items-center gap-1 font-medium text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-stone-400" />
                      Latest Incident: {latestDateStr}
                    </span>
                    {cluster.pendingCount > 0 ? (
                      <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[11px]">
                        {cluster.pendingCount} Pending Review
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                        All Reviewed
                      </span>
                    )}
                  </div>
                </div>

                {/* Evidence Thumbnail Preview */}
                <div className="relative aspect-video w-full rounded-2xl bg-stone-950 overflow-hidden border border-stone-800 flex items-center justify-center">
                  {hasEvidence && cluster.latestEvidenceEvent && !failedImageIds[cluster.latestEvidenceEvent.id] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={continuousProctoringService.getEvidenceImageUrl(cluster.latestEvidenceEvent.id)}
                        alt={`Latest capture for ${cluster.studentName} Attempt ${cluster.attemptNumber}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={() => {
                          if (cluster.latestEvidenceEvent) {
                            const errId = cluster.latestEvidenceEvent.id;
                            setFailedImageIds((prev) => ({ ...prev, [errId]: true }));
                          }
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-transparent flex items-end justify-between p-3">
                        <span className="text-[11px] font-mono text-white/95 flex items-center gap-1.5">
                          <Camera className="w-3 h-3 text-amber-400" />
                          Latest Capture Frame
                        </span>
                        {cluster.events.length > 1 && (
                          <span className="text-[10px] font-bold bg-stone-900/90 text-amber-300 px-2 py-0.5 rounded-full border border-stone-700 backdrop-blur-xs">
                            +{cluster.events.length - 1} more frames
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-4 text-stone-500 space-y-1">
                      <Camera className="w-6 h-6 mx-auto opacity-40 text-stone-400" />
                      <span className="text-[11px] block">No visual snapshots</span>
                    </div>
                  )}
                </div>

                {/* Event Types & Status Breakdown */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap gap-1">
                    {Array.from(cluster.eventTypes).map((type) => (
                      <span
                        key={type}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-stone-50 text-stone-700 border border-stone-200 font-medium"
                      >
                        {type.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                    <div
                      className={`p-1.5 rounded-xl border ${
                        cluster.pendingCount > 0
                          ? 'bg-amber-50 border-amber-200 text-amber-800 font-bold'
                          : 'bg-stone-50 border-stone-200 text-stone-500'
                      }`}
                    >
                      <span>{cluster.pendingCount} Pending</span>
                    </div>
                    <div
                      className={`p-1.5 rounded-xl border ${
                        cluster.confirmedCount > 0
                          ? 'bg-rose-50 border-rose-200 text-rose-800 font-bold'
                          : 'bg-stone-50 border-stone-200 text-stone-500'
                      }`}
                    >
                      <span>{cluster.confirmedCount} Confirmed</span>
                    </div>
                    <div className="p-1.5 rounded-xl border bg-stone-50 border-stone-200 text-stone-500">
                      <span>{cluster.resolvedCount} Resolved</span>
                    </div>
                  </div>
                </div>

                {/* Clickable Action Footer */}
                <div className="pt-2 border-t border-[#EBE5DC] flex items-center justify-between text-xs text-[#C25E1A] font-bold group-hover:translate-x-0.5 transition-transform">
                  <span>Open Attempt #{cluster.attemptNumber} Evidence ({cluster.events.length})</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </Card>
            );
          })}
        </div>
      ) : groupingMode === 'STUDENT' ? (
        /* ─────────────────────────────────────────────────────────────
           MODE 2: GROUP BY STUDENT
           Complete examination history per candidate, listing each attempt separately
           ───────────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
          {studentHistoryClusters.map((studentCluster) => {
            return (
              <Card
                key={studentCluster.studentId}
                className="p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm flex flex-col justify-between space-y-4 hover:border-stone-400 transition-all w-full"
              >
                {/* Student Summary Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC] flex items-center justify-center text-stone-800 font-bold text-sm shadow-warm-xs">
                        {studentCluster.studentName ? studentCluster.studentName.charAt(0).toUpperCase() : 'S'}
                      </div>
                      <div>
                        <h4 className="font-bold text-stone-900 text-sm">
                          {studentCluster.studentName}
                        </h4>
                        <p className="text-xs text-stone-500">
                          {studentCluster.studentRollNumber ? `ID: ${studentCluster.studentRollNumber} • ` : ''}
                          {studentCluster.studentEmail}
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FAF7F2] text-stone-700 border border-[#EBE5DC]">
                      {studentCluster.attempts.length} {studentCluster.attempts.length === 1 ? 'Attempt' : 'Attempts'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>Total Incidents Across Attempts: <strong>{studentCluster.totalIncidents}</strong></span>
                    {studentCluster.pendingCount > 0 ? (
                      <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[11px]">
                        {studentCluster.pendingCount} Pending Review
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                        All Reviewed
                      </span>
                    )}
                  </div>
                </div>

                {/* Individual Examination Attempts List (Strictly unmerged!) */}
                <div className="space-y-2 border-t border-[#EBE5DC] pt-3">
                  <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                    Examination Attempts
                  </p>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {studentCluster.attempts.map((att) => (
                      <div
                        key={att.attemptId}
                        onClick={() => setSelectedAttemptId(att.attemptId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedAttemptId(att.attemptId);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open attempt ${att.attemptNumber} for ${att.examTitle}`}
                        className="p-3 rounded-2xl bg-[#FAF7F2] hover:bg-[#FAF7F2]/80 border border-[#EBE5DC] hover:border-[#C25E1A]/50 transition-all cursor-pointer space-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C25E1A]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900 truncate">
                            <span className="px-2 py-0.5 rounded-full bg-[#C25E1A] text-white text-[10px]">
                              Attempt #{att.attemptNumber}
                            </span>
                            <span className="truncate">{att.examTitle}</span>
                          </div>
                          <span className="text-[11px] font-bold text-[#C25E1A] shrink-0">
                            {att.events.length} {att.events.length === 1 ? 'Incident' : 'Incidents'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-stone-500">
                          <span>Date: {formatDateTime(att.startedAt)}</span>
                          <span className="text-[10px] font-semibold text-stone-600">
                            {att.pendingCount > 0 ? `${att.pendingCount} Pending` : `${att.confirmedCount} Confirmed`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer action to drill down into student */}
                <div className="pt-2 border-t border-[#EBE5DC] flex items-center justify-between text-xs text-[#C25E1A] font-bold">
                  <button
                    onClick={() => setSelectedStudentId(studentCluster.studentId)}
                    className="hover:underline flex items-center gap-1"
                  >
                    <span>View Complete Student History</span>
                    <History className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ─────────────────────────────────────────────────────────────
           MODE 3: ALL INCIDENTS (FLAT TIMELINE)
           ───────────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 w-full">
          {filteredEvents.map(renderIncidentCard)}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
         FULL EVIDENCE INSPECTION MODAL (HIGH RESOLUTION & AUDIT TRAIL)
         ───────────────────────────────────────────────────────────── */}
      {inspectingEvent && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <Card className="w-full max-w-4xl bg-white border border-stone-700 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[#EBE5DC] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  {getEventBadge(inspectingEvent.event_type, inspectingEvent)}
                  <h3 className="font-serif font-bold text-xl text-stone-900">
                    Proctoring Evidence Inspection
                  </h3>
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  Student: <strong>{inspectingEvent.student_name}</strong> (
                  {inspectingEvent.student_email || inspectingEvent.student_id}) • Exam:{' '}
                  <strong>{inspectingEvent.exam_title || examTitle || inspectingEvent.exam_id}</strong>
                  {inspectingEvent.attempt_number && (
                    <span> • <strong>Attempt #{inspectingEvent.attempt_number}</strong></span>
                  )}
                </p>
              </div>

              <button
                onClick={() => setInspectingEvent(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
                aria-label="Close inspection modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Large High-Res Image & Metadata */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Evidence Visual Capture */}
              <div className="lg:col-span-2 space-y-2">
                <div className="relative aspect-video w-full rounded-2xl bg-stone-950 overflow-hidden border border-stone-800 flex items-center justify-center">
                  {inspectingEvent.evidence_url && !failedImageIds[inspectingEvent.id] ? (
                    inspectingEvent.metadata_json?.media_type === 'audio' || inspectingEvent.event_type.includes('VOICE') ? (
                      <div className="p-8 w-full flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                          <Volume2 className="w-8 h-8 text-amber-400 animate-pulse" />
                        </div>
                        <div className="text-center space-y-1">
                          <p className="text-sm font-bold text-white">Recorded Room Voice Evidence Clip</p>
                          <p className="text-xs text-stone-400">
                            Acoustic voice activity recorded ({inspectingEvent.metadata_json?.decibels ?? -35} dB, sustained {inspectingEvent.duration || 2.5}s)
                          </p>
                        </div>
                        <audio
                          controls
                          className="w-full max-w-md mt-2"
                          src={continuousProctoringService.getEvidenceImageUrl(inspectingEvent.id)}
                        >
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={continuousProctoringService.getEvidenceImageUrl(inspectingEvent.id)}
                          alt="Proctoring visual evidence"
                          className="w-full h-full object-contain"
                          onError={() =>
                            setFailedImageIds((prev) => ({ ...prev, [inspectingEvent.id]: true }))
                          }
                        />
                        {inspectingEvent.metadata_json?.bounding_box && (
                          <div
                            className="absolute border-2 border-rose-500 bg-rose-500/20 rounded pointer-events-none transition-all shadow-[0_0_12px_rgba(244,63,94,0.6)]"
                            style={{
                              left: `${Math.max(0, Math.min(95, (inspectingEvent.metadata_json.bounding_box[0] / 640) * 100))}%`,
                              top: `${Math.max(0, Math.min(95, (inspectingEvent.metadata_json.bounding_box[1] / 480) * 100))}%`,
                              width: `${Math.min(100, (inspectingEvent.metadata_json.bounding_box[2] / 640) * 100)}%`,
                              height: `${Math.min(100, (inspectingEvent.metadata_json.bounding_box[3] / 480) * 100)}%`,
                            }}
                          >
                            <span className="absolute -top-6 left-0 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                              📱 {formatObjectName(
                                inspectingEvent.metadata_json.detected_object_name ||
                                inspectingEvent.metadata_json.primary_object ||
                                inspectingEvent.detected_identity_status
                              )}
                            </span>
                          </div>
                        )}
                      </>
                    )
                  ) : (
                    <div className="text-center p-6 text-stone-500 space-y-2">
                      <Camera className="w-10 h-10 mx-auto opacity-30 text-stone-400" />
                      <p className="text-xs">No visual screenshot stored for this event</p>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-stone-400 text-center">
                  Captured frame at {formatDateTime(inspectingEvent.detected_at)}
                </p>
              </div>

              {/* Event Metadata Breakdown */}
              <div className="space-y-4">
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3 text-xs">
                  <h4 className="font-bold text-stone-900 border-b border-stone-200 pb-2">
                    Detection Audit Record
                  </h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">
                        Examination Attempt
                      </span>
                      <span className="font-bold text-stone-800">
                        Attempt #{inspectingEvent.attempt_number || 1} • {inspectingEvent.exam_title || examTitle}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">
                        Current Review Status
                      </span>
                      <div className="mt-0.5">{getStatusBadge(inspectingEvent.review_status)}</div>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Timestamp</span>
                      <span className="font-medium text-stone-800">
                        {formatDateTime(inspectingEvent.detected_at)}
                      </span>
                    </div>
                    {inspectingEvent.event_type === 'UNAUTHORIZED_OBJECT' ? (
                      <div>
                        <span className="text-stone-400 block text-[10px] uppercase">
                          Prohibited Material Detected
                        </span>
                        <span className="font-bold text-rose-700 block">
                          📱 {formatObjectName(
                            inspectingEvent.metadata_json?.detected_object_name ||
                            inspectingEvent.metadata_json?.primary_object ||
                            inspectingEvent.detected_identity_status
                          )}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-stone-400 block text-[10px] uppercase">
                          Incident Duration
                        </span>
                        <span className="font-medium text-stone-800">
                          {inspectingEvent.duration ? `${inspectingEvent.duration}s` : '< 3s'}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">
                        Face Count Detected
                      </span>
                      <span className="font-medium text-stone-800">
                        {inspectingEvent.face_count}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">
                        {inspectingEvent.event_type === 'UNAUTHORIZED_OBJECT'
                          ? 'Object Detection Confidence'
                          : 'Identity Match Confidence'}
                      </span>
                      <span className="font-medium text-stone-800">
                        {inspectingEvent.confidence !== null && inspectingEvent.confidence !== undefined
                          ? `${Math.round(inspectingEvent.confidence * 100)}%`
                          : 'N/A'}
                        {inspectingEvent.event_type === 'UNAUTHORIZED_OBJECT' && ' (AI Certainty)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">
                        Unique Attempt ID
                      </span>
                      <span className="font-mono text-[10px] text-stone-600 truncate block">
                        {inspectingEvent.exam_attempt_id || 'None'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Faculty Evaluation Form */}
                <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] space-y-3">
                  <h4 className="font-bold text-stone-900 text-xs">Faculty Judgment</h4>
                  <p className="text-[11px] text-stone-500">
                    Verify whether this frame represents academic misconduct or a temporary false positive.
                  </p>

                  <textarea
                    rows={2}
                    placeholder="Add faculty notes / evaluation rationale..."
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#C25E1A]"
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={isUpdatingReview}
                      onClick={() =>
                        handleReviewAction(inspectingEvent.id, 'CONFIRMED', reviewNote)
                      }
                      className="text-xs bg-rose-700 hover:bg-rose-800 text-white"
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={isUpdatingReview}
                      onClick={() =>
                        handleReviewAction(inspectingEvent.id, 'FALSE_POSITIVE', reviewNote)
                      }
                      className="text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                    >
                      False Pos
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={isUpdatingReview}
                      onClick={() =>
                        handleReviewAction(inspectingEvent.id, 'DISMISSED', reviewNote)
                      }
                      className="text-xs text-stone-600 border-stone-300 hover:bg-stone-100"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
