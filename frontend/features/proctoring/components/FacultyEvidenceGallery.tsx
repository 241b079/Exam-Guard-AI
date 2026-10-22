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

export function FacultyEvidenceGallery({
  examId,
  examTitle,
  autoRefreshIntervalMs = 8000,
}: FacultyEvidenceGalleryProps) {
  const [events, setEvents] = useState<ProctoringEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // View Mode: 'CLUSTER' (default grouped by student) vs 'TIMELINE' (flat chronological)
  const [viewMode, setViewMode] = useState<'CLUSTER' | 'TIMELINE'>('CLUSTER');

  // Selected student cluster for viewing that student's proctored gallery
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Selected event for full inspection modal
  const [inspectingEvent, setInspectingEvent] = useState<ProctoringEventItem | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [isUpdatingReview, setIsUpdatingReview] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      setError(null);
      const res = await continuousProctoringService.listProctoringEvents(examId, {
        reviewStatus: selectedStatus === 'ALL' ? undefined : selectedStatus,
        eventType: selectedEventType === 'ALL' ? undefined : selectedEventType,
        limit: 200,
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

  // Periodic polling for new evidence
  useEffect(() => {
    if (!autoRefreshIntervalMs) return;
    const interval = setInterval(() => {
      fetchEvents();
    }, autoRefreshIntervalMs);
    return () => clearInterval(interval);
  }, [autoRefreshIntervalMs, fetchEvents]);

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
        e.event_type.toLowerCase().includes(term)
      );
    });
  }, [events, searchTerm]);

  // Group filtered events into student clusters
  const studentClusters = useMemo(() => {
    const map = new Map<
      string,
      {
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
        eventTypes: Set<string>;
      }
    >();

    filteredEvents.forEach((ev) => {
      const key = ev.student_id || ev.student_email || 'unknown_student';
      let cluster = map.get(key);
      if (!cluster) {
        cluster = {
          studentId: key,
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
          eventTypes: new Set<string>(),
        };
        map.set(key, cluster);
      }

      cluster.events.push(ev);
      cluster.eventTypes.add(ev.event_type);

      if (ev.review_status === 'PENDING') cluster.pendingCount++;
      else if (ev.review_status === 'CONFIRMED') cluster.confirmedCount++;
      else if (ev.review_status === 'DISMISSED') cluster.dismissedCount++;
      else if (ev.review_status === 'FALSE_POSITIVE') cluster.falsePosCount++;

      // Track latest event by timestamp
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

    // Sort student clusters by most recent incident
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.latestEvent.detected_at).getTime() -
        new Date(a.latestEvent.detected_at).getTime()
    );
  }, [filteredEvents]);

  // Active cluster if viewing a specific student
  const activeCluster = useMemo(() => {
    if (!selectedStudentId) return null;
    return studentClusters.find((c) => c.studentId === selectedStudentId) || null;
  }, [selectedStudentId, studentClusters]);

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'IDENTITY_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <UserX className="w-3.5 h-3.5 text-rose-600" /> Identity Mismatch
          </span>
        );
      case 'MULTIPLE_PERSON_IDENTITY_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 animate-pulse">
            <Users className="w-3.5 h-3.5 text-purple-600" /> Multiple Person + Mismatch
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

  // Render individual incident card
  const renderIncidentCard = (ev: ProctoringEventItem) => {
    const hasEvidence = Boolean(ev.evidence_url);
    const timeStr = new Date(ev.detected_at).toLocaleTimeString();

    return (
      <Card
        key={ev.id}
        className="p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm flex flex-col justify-between space-y-4 hover:border-stone-400 transition-all"
      >
        {/* Card Top: Student & Status */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <h4 className="font-bold text-stone-900 text-sm">
                {ev.student_name || 'Candidate'}
              </h4>
              <p className="text-xs text-stone-500">
                {ev.student_roll_number ? `ID: ${ev.student_roll_number} • ` : ''}
                {ev.student_email || ev.student_id}
              </p>
            </div>
            {getStatusBadge(ev.review_status)}
          </div>

          <div className="flex items-center justify-between gap-2">
            {getEventBadge(ev.event_type)}
            <span className="text-[11px] font-mono text-stone-400">
              {timeStr}
            </span>
          </div>
        </div>

        {/* Evidence Thumbnail / Snapshot Container */}
        <div className="relative aspect-video w-full rounded-2xl bg-stone-950 overflow-hidden border border-stone-800 flex items-center justify-center group">
          {hasEvidence ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={continuousProctoringService.getEvidenceImageUrl(ev.id)}
                alt={`Evidence for ${ev.event_type}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
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
            <span className="text-[10px] text-stone-400 block uppercase">Duration</span>
            <span className="font-semibold text-stone-700">
              {ev.duration ? `${ev.duration}s` : '< 3s'}
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
            <Eye className="w-3.5 h-3.5" /> Details
          </Button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handleReviewAction(ev.id, 'CONFIRMED')}
              disabled={isUpdatingReview}
              title="Confirm Academic Misconduct"
              className="px-2 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => handleReviewAction(ev.id, 'FALSE_POSITIVE')}
              disabled={isUpdatingReview}
              title="Mark as False Positive (e.g. poor lighting, motion blur)"
              className="px-2 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              False Pos
            </button>
            <button
              onClick={() => handleReviewAction(ev.id, 'DISMISSED')}
              disabled={isUpdatingReview}
              title="Dismiss Incident"
              className="px-2 py-1 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#C25E1A]" />
            <h3 className="font-serif font-bold text-lg text-stone-900">
              Proctoring Evidence & Identity Timeline
            </h3>
            <span className="text-xs bg-stone-100 font-semibold text-stone-700 px-2 py-0.5 rounded-full">
              {studentClusters.length} {studentClusters.length === 1 ? 'Student' : 'Students'} • {filteredEvents.length} {filteredEvents.length === 1 ? 'Incident' : 'Incidents'}
            </span>
          </div>
          <p className="text-xs text-stone-500">
            Automated visual captures of confirmed suspicious identity events, clustered per candidate to easily review each student’s proctoring records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchEvents}
            isLoading={isLoading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Filter & View Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#FAF7F2] border border-[#EBE5DC] rounded-2xl text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-stone-500 font-medium">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </div>

          <input
            type="text"
            placeholder="Search student name, roll number, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-stone-300 bg-white text-stone-900 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-[#C25E1A]"
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
              <option value="RECOVERED">Recovered</option>
            </select>
          </div>
        </div>

        {/* View Mode Toggle: Clustered by Student vs Flat Timeline */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-200">
          <button
            onClick={() => {
              setViewMode('CLUSTER');
              setSelectedStudentId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'CLUSTER' && !selectedStudentId
                ? 'bg-[#C25E1A] text-white shadow-warm-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Group by Student ({studentClusters.length})
          </button>
          <button
            onClick={() => {
              setViewMode('TIMELINE');
              setSelectedStudentId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'TIMELINE'
                ? 'bg-[#C25E1A] text-white shadow-warm-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            All Incidents ({filteredEvents.length})
          </button>
        </div>
      </div>

      {/* Main Content: Clustered View vs Single Student View vs Flat Timeline */}
      {filteredEvents.length === 0 ? (
        <Card className="p-12 text-center space-y-3 bg-white border border-[#EBE5DC] rounded-3xl">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <h4 className="font-serif font-bold text-stone-800 text-base">
            No Suspicious Incidents Found
          </h4>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            {events.length === 0
              ? 'All active candidates have maintained verified identity status without confirmed mismatch or prolonged absence.'
              : 'No proctoring incidents match your selected filters.'}
          </p>
        </Card>
      ) : selectedStudentId && activeCluster ? (
        /* DEDICATED STUDENT PROCTORED GALLERY (WHEN A STUDENT BOX IS CLICKED) */
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Student Sub-Header & Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm-sm">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedStudentId(null)}
                className="px-3 py-2 rounded-2xl border border-stone-300 bg-[#FAF7F2] hover:bg-stone-100 text-stone-800 text-xs font-bold flex items-center gap-1.5 shadow-warm-xs transition-all hover:-translate-x-0.5"
              >
                <ChevronLeft className="w-4 h-4 text-[#C25E1A]" />
                Back to All Students
              </button>

              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="font-serif font-bold text-base text-stone-900">
                    {activeCluster.studentName}
                  </h4>
                  <span className="text-xs bg-[#C25E1A]/10 text-[#C25E1A] font-bold px-2.5 py-0.5 rounded-full border border-[#C25E1A]/20">
                    {activeCluster.events.length} Incidents
                  </span>
                </div>
                <p className="text-xs text-stone-500">
                  {activeCluster.studentRollNumber
                    ? `Roll No: ${activeCluster.studentRollNumber} • `
                    : ''}
                  {activeCluster.studentEmail}
                </p>
              </div>
            </div>

            {/* Quick Summary Counts & Student Switcher */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs">
                {activeCluster.pendingCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    {activeCluster.pendingCount} Pending Review
                  </span>
                )}
                {activeCluster.confirmedCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
                    {activeCluster.confirmedCount} Confirmed Misconduct
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-600 border border-stone-200">
                  {activeCluster.dismissedCount + activeCluster.falsePosCount} Resolved
                </span>
              </div>

              {studentClusters.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs border-l border-[#EBE5DC] pl-3">
                  <span className="text-stone-500">Switch:</span>
                  <select
                    value={activeCluster.studentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="px-2.5 py-1 rounded-xl border border-stone-300 bg-white text-stone-800 text-xs font-semibold focus:outline-none"
                  >
                    {studentClusters.map((c) => (
                      <option key={c.studentId} value={c.studentId}>
                        {c.studentName} ({c.events.length})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Incidents Grid for this student */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {activeCluster.events.map(renderIncidentCard)}
          </div>
        </div>
      ) : viewMode === 'CLUSTER' ? (
        /* CLUSTERED STUDENT BOXES GRID */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {studentClusters.map((cluster) => {
            const hasEvidence = Boolean(cluster.latestEvidenceEvent?.evidence_url);
            const latestTime = new Date(cluster.latestEvent.detected_at).toLocaleTimeString();

            return (
              <Card
                key={cluster.studentId}
                onClick={() => setSelectedStudentId(cluster.studentId)}
                className="p-5 bg-white border border-[#EBE5DC] rounded-3xl shadow-warm hover:shadow-warm-md hover:border-[#C25E1A]/60 transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
              >
                {/* Student Box Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC] flex items-center justify-center text-stone-800 font-bold text-sm shadow-warm-xs group-hover:bg-[#C25E1A]/10 group-hover:text-[#C25E1A] transition-colors">
                        {cluster.studentName
                          ? cluster.studentName.charAt(0).toUpperCase()
                          : 'C'}
                      </div>
                      <div>
                        <h4 className="font-bold text-stone-900 text-sm group-hover:text-[#C25E1A] transition-colors">
                          {cluster.studentName}
                        </h4>
                        <p className="text-xs text-stone-500">
                          {cluster.studentRollNumber
                            ? `ID: ${cluster.studentRollNumber} • `
                            : ''}
                          {cluster.studentEmail}
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FAF7F2] text-stone-700 border border-[#EBE5DC]">
                      {cluster.events.length} {cluster.events.length === 1 ? 'Incident' : 'Incidents'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span className="flex items-center gap-1 font-medium">
                      <Clock className="w-3.5 h-3.5 text-stone-400" />
                      Latest: {latestTime}
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
                  {hasEvidence && cluster.latestEvidenceEvent ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={continuousProctoringService.getEvidenceImageUrl(
                          cluster.latestEvidenceEvent.id
                        )}
                        alt={`Latest capture for ${cluster.studentName}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
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
                      <span>{cluster.dismissedCount + cluster.falsePosCount} Resolved</span>
                    </div>
                  </div>
                </div>

                {/* Clickable Action Footer */}
                <div className="pt-2 border-t border-[#EBE5DC] flex items-center justify-between text-xs text-[#C25E1A] font-bold group-hover:translate-x-0.5 transition-transform">
                  <span>Open {cluster.studentName}’s Evidence ({cluster.events.length})</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* FLAT TIMELINE (WHEN ALL INCIDENTS TOGGLE IS SELECTED) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredEvents.map(renderIncidentCard)}
        </div>
      )}

      {/* Full Evidence Inspection Modal */}
      {inspectingEvent && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <Card className="w-full max-w-4xl bg-white border border-stone-700 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[#EBE5DC] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  {getEventBadge(inspectingEvent.event_type)}
                  <h3 className="font-serif font-bold text-xl text-stone-900">
                    Proctoring Evidence Inspection
                  </h3>
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  Student: <strong>{inspectingEvent.student_name}</strong> (
                  {inspectingEvent.student_email || inspectingEvent.student_id}) • Exam:{' '}
                  {examTitle || inspectingEvent.exam_id}
                </p>
              </div>

              <button
                onClick={() => setInspectingEvent(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Large High-Res Image & Metadata */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Evidence Visual Capture */}
              <div className="lg:col-span-2 space-y-2">
                <div className="relative aspect-video w-full rounded-2xl bg-stone-950 overflow-hidden border border-stone-800 flex items-center justify-center">
                  {inspectingEvent.evidence_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={continuousProctoringService.getEvidenceImageUrl(inspectingEvent.id)}
                      alt="Proctoring visual evidence"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center p-6 text-stone-500 space-y-2">
                      <Camera className="w-10 h-10 mx-auto opacity-30 text-stone-400" />
                      <p className="text-xs">No visual screenshot stored for this event</p>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-stone-400 text-center">
                  Captured frame at{' '}
                  {new Date(inspectingEvent.detected_at).toLocaleString()}
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
                        Current Review Status
                      </span>
                      <div className="mt-0.5">{getStatusBadge(inspectingEvent.review_status)}</div>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Timestamp</span>
                      <span className="font-medium text-stone-800">
                        {new Date(inspectingEvent.detected_at).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">
                        Incident Duration
                      </span>
                      <span className="font-medium text-stone-800">
                        {inspectingEvent.duration ? `${inspectingEvent.duration}s` : '< 3s'}
                      </span>
                    </div>
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
                        Identity Match Confidence
                      </span>
                      <span className="font-medium text-stone-800">
                        {inspectingEvent.confidence !== null && inspectingEvent.confidence !== undefined
                          ? `${Math.round(inspectingEvent.confidence * 100)}%`
                          : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">
                        Incident Grouping ID
                      </span>
                      <span className="font-mono text-[10px] text-stone-600 truncate block">
                        {inspectingEvent.incident_id || 'Single Event'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Faculty Evaluation Form */}
                <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] space-y-3">
                  <h4 className="font-bold text-stone-900 text-xs">Faculty Judgment</h4>
                  <p className="text-[11px] text-stone-500">
                    Verify whether this frame represents academic misconduct or a temporary false positive (e.g., student coughing, lighting glare, head tilt).
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
