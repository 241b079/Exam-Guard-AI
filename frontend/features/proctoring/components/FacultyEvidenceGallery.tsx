'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
        limit: 150,
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

  const filteredEvents = events.filter((e) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (e.student_name && e.student_name.toLowerCase().includes(term)) ||
      (e.student_email && e.student_email.toLowerCase().includes(term)) ||
      (e.student_roll_number && e.student_roll_number.toLowerCase().includes(term)) ||
      e.event_type.toLowerCase().includes(term)
    );
  });

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
            {type}
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
              {filteredEvents.length} {filteredEvents.length === 1 ? 'incident' : 'incidents'}
            </span>
          </div>
          <p className="text-xs text-stone-500">
            Automated visual captures of confirmed suspicious identity events. AI flags potential violations; final academic evaluation remains with faculty.
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

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-[#FAF7F2] border border-[#EBE5DC] rounded-2xl text-xs">
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

      {/* Events List */}
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredEvents.map((ev) => {
            const hasEvidence = Boolean(ev.evidence_url);
            const dateStr = new Date(ev.detected_at).toLocaleDateString();
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
          })}
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
