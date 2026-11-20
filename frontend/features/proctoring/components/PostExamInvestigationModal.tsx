'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Camera,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Scale,
  Sparkles,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getApiUrl } from '@/lib/api';
import {
  continuousProctoringService,
  ExaminationInvestigationResponse,
  IncidentTimelineItem,
} from '../services/continuousProctoringService';

interface PostExamInvestigationModalProps {
  isOpen: boolean;
  onClose: () => void;
  examId: string;
  attemptId: string;
  onDecisionApplied?: () => void;
}

export function PostExamInvestigationModal({
  isOpen,
  onClose,
  examId,
  attemptId,
  onDecisionApplied,
}: PostExamInvestigationModalProps) {
  const [investigation, setInvestigation] = useState<ExaminationInvestigationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decision state
  const [decision, setDecision] = useState<string>('CLEARED');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [publishResultOnDecision, setPublishResultOnDecision] = useState<boolean>(false);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [isPublishingResult, setIsPublishingResult] = useState<boolean>(false);

  // Incident review state
  const [reviewingIncidentId, setReviewingIncidentId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Load investigation dossier
  const loadInvestigation = useCallback(async () => {
    if (!examId || !attemptId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await continuousProctoringService.getInvestigation(examId, attemptId);
      setInvestigation(data);
      if (data.faculty_decision) {
        setDecision(data.faculty_decision);
        setReason(data.decision_reason || '');
        setNotes(data.decision_notes || '');
      } else {
        // Dynamic Intelligent Pre-selection based on AI Assessment
        if (data.auto_disqualification_recommended || data.overall_risk_level === 'CRITICAL_RISK' || data.overall_risk_level === 'HIGH_RISK') {
          setDecision('DISQUALIFIED');
          setReason(data.auto_disqualification_reason || data.ai_recommendation || 'Automated integrity assessment: Critical/High policy violations detected.');
          setPublishResultOnDecision(false);
        } else if (data.overall_risk_level === 'MODERATE_RISK') {
          setDecision('SUSPICIOUS');
          setReason(data.ai_recommendation || 'Moderate telemetry anomalies observed.');
        } else {
          setDecision('CLEARED');
          setReason('No significant malpractice or unauthorized activities detected.');
        }
      }
      if (data.publication_status === 'PUBLISHED') {
        setPublishResultOnDecision(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load post-examination investigation report.');
    } finally {
      setLoading(false);
    }
  }, [examId, attemptId]);

  useEffect(() => {
    if (isOpen) {
      loadInvestigation();
    } else {
      setInvestigation(null);
      setError(null);
      setDecisionError(null);
      setPreviewImageUrl(null);
    }
  }, [isOpen, loadInvestigation]);

  // Handle incident status review (e.g. mark False Positive)
  const handleIncidentReview = async (incidentId: string, status: 'CONFIRMED' | 'FALSE_POSITIVE') => {
    setReviewingIncidentId(incidentId);
    try {
      let comment = '';
      if (status === 'FALSE_POSITIVE') {
        const inputComment = window.prompt(
          'Provide a reason for rejecting this incident as a False Positive (score will be recalculated):',
          'Candidate natural gesture or benign event.'
        );
        if (inputComment === null) {
          setReviewingIncidentId(null);
          return;
        }
        comment = inputComment;
      }

      await continuousProctoringService.reviewIncident(attemptId, incidentId, {
        status,
        comment,
      });
      // Reload dossier to reflect recalculated score
      await loadInvestigation();
    } catch (err: any) {
      alert(err?.message || 'Failed to update incident review status.');
    } finally {
      setReviewingIncidentId(null);
    }
  };

  // Submit formal decision
  const handleSubmitDecision = async () => {
    setDecisionError(null);
    if ((decision === 'DISQUALIFIED' || decision === 'VIOLATION_CONFIRMED') && !reason.trim()) {
      setDecisionError('A formal justification reason is required for adverse actions (Disqualification / Violation Confirmation).');
      return;
    }

    if (decision === 'DISQUALIFIED') {
      const confirmed = window.confirm(
        'Are you sure you want to DISQUALIFY this examination attempt? This action is irrevocable, zeroes the total grade, and archives this formal audit record.'
      );
      if (!confirmed) return;
    }

    setIsSubmittingDecision(true);
    try {
      const updated = await continuousProctoringService.submitDecision(attemptId, {
        decision,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
        publish_result: publishResultOnDecision,
      });
      setInvestigation(updated);
      onDecisionApplied?.();
      alert(`Decision recorded successfully: ${decision}${publishResultOnDecision ? ' (Result Published)' : ''}`);
    } catch (err: any) {
      setDecisionError(err?.message || 'Failed to submit faculty decision.');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const handlePublishResult = async () => {
    setIsPublishingResult(true);
    try {
      await continuousProctoringService.publishAttemptResult(attemptId);
      await loadInvestigation();
      onDecisionApplied?.();
      alert('Examination result has been published to student.');
    } catch (err: any) {
      alert(err?.message || 'Failed to publish result.');
    } finally {
      setIsPublishingResult(false);
    }
  };

  const handleHoldResult = async () => {
    const reasonPrompt = window.prompt('Specify reason for holding result publication:', 'Pending academic integrity verification');
    if (reasonPrompt === null) return;
    setIsPublishingResult(true);
    try {
      await continuousProctoringService.holdAttemptResult(attemptId, reasonPrompt);
      await loadInvestigation();
      onDecisionApplied?.();
      alert('Result has been held from student publication.');
    } catch (err: any) {
      alert(err?.message || 'Failed to hold result.');
    } finally {
      setIsPublishingResult(false);
    }
  };

  if (!isOpen) return null;

  const getRiskBadgeColor = (level: string) => {
    switch (level?.toUpperCase()) {
      case 'CRITICAL':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'MEDIUM':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  const getInvestigationStatusBadge = (status?: string) => {
    switch (status) {
      case 'DISQUALIFIED':
        return <Badge variant="danger">DISQUALIFIED</Badge>;
      case 'VIOLATION_CONFIRMED':
        return <Badge variant="danger">VIOLATION CONFIRMED</Badge>;
      case 'CLEARED':
        return <Badge variant="success">CLEARED</Badge>;
      case 'UNDER_INVESTIGATION':
        return <Badge variant="warning">UNDER INVESTIGATION</Badge>;
      case 'INCONCLUSIVE':
        return <Badge variant="outline">INCONCLUSIVE</Badge>;
      default:
        return <Badge variant="warning">{status || 'PENDING REVIEW'}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-4xl p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm-lg space-y-6 my-8 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#EBE5DC] pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-xl bg-red-50 text-red-600 border border-red-100">
                <Scale className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold font-serif text-stone-900">
                Post-Examination AI Investigation Dossier
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Evidence-based evaluation & academic integrity adjudication workflow. Disqualification requires authentic faculty review.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 p-2 rounded-xl hover:bg-stone-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6">
          {loading && (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-stone-400 animate-spin mx-auto" />
              <p className="text-sm text-stone-500 font-medium">Synthesizing proctoring timeline and risk dossier...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {investigation && (
            <>
              {/* Top Banner: Student info & Risk Score Gauge */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Student Details */}
                <div className="p-4 rounded-2xl bg-stone-50 border border-[#EBE5DC] space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Candidate</span>
                  <div className="font-bold text-stone-900 text-base">{investigation.student_name || 'Candidate'}</div>
                  <div className="text-xs text-stone-600">{investigation.student_email || 'No email'}</div>
                  {investigation.student_roll_number && (
                    <div className="text-xs text-stone-500 font-mono">Roll: {investigation.student_roll_number}</div>
                  )}
                  <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                    {getInvestigationStatusBadge(investigation.investigation_status)}
                    <Badge variant={investigation.publication_status === 'PUBLISHED' ? 'success' : 'outline'} className="text-[10px]">
                      {investigation.publication_status || 'UNPUBLISHED'}
                    </Badge>
                  </div>
                </div>

                {/* AI Integrity Risk & Score */}
                <div className="p-4 rounded-2xl bg-stone-50 border border-[#EBE5DC] space-y-1.5 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">AI Integrity Risk</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-2xl font-extrabold text-stone-900">
                        {investigation.overall_risk_level || investigation.risk_classification || 'LOW_RISK'}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 mt-1">
                      Risk Score: <strong className="text-stone-900">{Number(investigation?.final_risk_score ?? 0).toFixed(1)} / 100</strong>
                    </div>
                  </div>
                  <div className="text-[11px] text-stone-500 flex justify-between pt-2 border-t border-[#EBE5DC]">
                    <span>Peak: {Number(investigation?.peak_risk_score ?? investigation?.final_risk_score ?? 0).toFixed(1)}</span>
                    <span>Priority: <strong>{investigation?.review_priority || 'LOW'}</strong></span>
                  </div>
                </div>

                {/* Aggregated Evidence Counters */}
                <div className="p-4 rounded-2xl bg-stone-50 border border-[#EBE5DC] space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Evidence Aggregation</span>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="p-2 rounded-xl bg-red-50 border border-red-100">
                      <div className="text-lg font-bold text-red-700">
                        {investigation.high_confidence_count ?? investigation.confirmed_incidents_count ?? investigation.confirmed_count ?? 0}
                      </div>
                      <div className="text-[10px] text-red-600 font-semibold uppercase">High Conf</div>
                    </div>
                    <div className="p-2 rounded-xl bg-amber-50 border border-amber-100">
                      <div className="text-lg font-bold text-amber-700">
                        {investigation.low_confidence_count ?? investigation.suspicious_incidents_count ?? investigation.suspicious_count ?? 0}
                      </div>
                      <div className="text-[10px] text-amber-600 font-semibold uppercase">Suspicious</div>
                    </div>
                    <div className="p-2 rounded-xl bg-stone-100 border border-stone-200">
                      <div className="text-lg font-bold text-stone-700">
                        {investigation.independent_incident_count ?? investigation.total_incidents ?? 0}
                      </div>
                      <div className="text-[10px] text-stone-500 font-semibold uppercase">Episodes</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Controlled Result Publication Status Card */}
              <div className="p-4 rounded-2xl bg-white border border-[#EBE5DC] shadow-warm-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-500">Candidate Result Status:</span>
                    <Badge variant={investigation.publication_status === 'PUBLISHED' ? 'success' : 'outline'}>
                      {investigation.publication_status || 'UNPUBLISHED'}
                    </Badge>
                    {investigation.evaluated_score !== undefined && investigation.evaluated_score !== null && (
                      <span className="text-xs font-bold text-stone-800 ml-2">
                        Evaluated Score: {investigation.evaluated_score} / {investigation.max_possible_score ?? 0}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">
                    {investigation.publication_status === 'PUBLISHED'
                      ? 'Marks and answer keys are currently visible to the student.'
                      : 'Evaluated score is currently withheld from the candidate pending faculty publication.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {investigation.publication_status !== 'PUBLISHED' ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handlePublishResult}
                      disabled={isPublishingResult}
                      className="text-xs"
                    >
                      {isPublishingResult ? 'Publishing...' : 'Publish Result to Student'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleHoldResult}
                      disabled={isPublishingResult}
                      className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                    >
                      {isPublishingResult ? 'Holding...' : 'Hold Result'}
                    </Button>
                  )}
                </div>
              </div>

              {/* AI Recommendation & Executive Summary */}
              <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/60 space-y-3">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>AI Integrity Assessment & Recommendation</span>
                </div>
                {investigation.ai_recommendation && (
                  <div className="p-3 rounded-xl bg-white/80 border border-amber-200 text-xs font-semibold text-amber-950">
                    {investigation.ai_recommendation}
                  </div>
                )}
                <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line">
                  {investigation.executive_summary}
                </p>

                {/* Evidence Category Breakdown Chips */}
                {investigation.evidence_breakdown_json?.categories && (
                  <div className="pt-2 border-t border-amber-200/40">
                    <span className="text-[11px] font-bold text-amber-900 block mb-1.5">Category Breakdown:</span>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(investigation.evidence_breakdown_json.categories).map(([cat, stats]: [string, any]) => (
                        <div key={cat} className="px-2.5 py-1 rounded-xl bg-white border border-amber-200/80 text-[11px] text-stone-800">
                          <strong className="text-stone-900">{cat.replace(/_/g, ' ')}:</strong> {stats.total} events ({stats.high_confidence} high conf, {stats.episodes} episode{stats.episodes !== 1 ? 's' : ''})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(investigation.correlations_json) && investigation.correlations_json.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-amber-200/40 space-y-1">
                    <span className="text-[11px] font-bold text-amber-900">Pattern Correlations Detected:</span>
                    <ul className="list-disc list-inside text-xs text-stone-700 space-y-0.5">
                      {investigation.correlations_json.map((c, idx) => (
                        <li key={idx}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {((Array.isArray(investigation.limitations_json) && investigation.limitations_json.length > 0) || investigation.limitations_notes) && (
                  <div className="mt-2 pt-2 border-t border-amber-200/40 text-[11px] text-stone-500 italic">
                    Evidence Limitations: {Array.isArray(investigation.limitations_json) && investigation.limitations_json.length > 0 ? investigation.limitations_json.join(' | ') : investigation.limitations_notes}
                  </div>
                )}
              </div>

              {/* Chronological Incident Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold font-serif text-stone-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-stone-600" />
                    <span>Chronological Incident Timeline & Evidence</span>
                    <span className="text-xs text-stone-400 font-normal">
                      ({investigation.incident_timeline_json?.length || 0} incidents)
                    </span>
                  </h3>
                  <span className="text-[11px] text-stone-500">
                    Rejecting false positives automatically updates the final score
                  </span>
                </div>

                {(!investigation.incident_timeline_json || investigation.incident_timeline_json.length === 0) ? (
                  <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-[#EBE5DC] text-stone-400 text-xs">
                    No suspicious proctoring incidents were recorded for this attempt.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {(() => {
                      const seen = new Set();
                      const deduplicated = (investigation.incident_timeline_json || []).filter((inc) => {
                        const timeKey = (inc.started_at || inc.timestamp || '').slice(0, 19);
                        const key = `${inc.incident_type}_${timeKey}`;
                        if (seen.has(key)) return false;
                        if (inc.incident_id && seen.has(inc.incident_id)) return false;
                        if (inc.event_id && seen.has(inc.event_id)) return false;
                        if (inc.incident_id) seen.add(inc.incident_id);
                        if (inc.event_id) seen.add(inc.event_id);
                        seen.add(key);
                        return true;
                      });

                      return deduplicated.map((inc) => {
                        const isFalsePositive = inc.review_status === 'FALSE_POSITIVE';
                        const isConfirmed = inc.review_status === 'CONFIRMED';
                        return (
                          <div
                            key={inc.incident_id || inc.event_id}
                            className={`p-3.5 rounded-2xl border transition-all text-xs ${
                              isFalsePositive
                                ? 'bg-stone-50/60 border-stone-200 opacity-60 line-through'
                                : isConfirmed
                                ? 'bg-red-50/40 border-red-200'
                                : 'bg-white border-[#EBE5DC] hover:border-stone-300'
                            }`}
                          >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-stone-900 text-xs">
                                  {(() => {
                                    const type = inc.incident_type;
                                    if (type === 'UNAUTHORIZED_OBJECT') {
                                      const obj = (inc as any).metadata?.detected_object_name || (inc as any).metadata?.primary_object || (inc as any).primary_object || 'Cell Phone';
                                      const u = String(obj).toUpperCase();
                                      if (u.includes('CELL') || u.includes('PHONE') || u.includes('MOBILE')) return '📱 Prohibited Object: Cell Phone (Mobile)';
                                      if (u.includes('BOOK') || u.includes('NOTE')) return '📖 Prohibited Object: Book / Notes';
                                      if (u.includes('LAPTOP') || u.includes('COMPUTER')) return '💻 Prohibited Object: Secondary Laptop';
                                      return `📱 Prohibited Object: ${String(obj).replace(/_/g, ' ')}`;
                                    }
                                    if (type === 'TEMPORARY_ABSENCE' || type === 'NO_FACE' || type === 'TEMPORARILY_ABSENT') {
                                      return '👤 Candidate Absent from Camera';
                                    }
                                    if (type === 'MULTIPLE_PERSON') {
                                      return '👥 Multiple Persons Detected';
                                    }
                                    if (type === 'MULTIPLE_PERSON_IDENTITY_MISMATCH') {
                                      return '🚨 Multiple Persons + Impostor Mismatch';
                                    }
                                    if (type === 'IDENTITY_MISMATCH') {
                                      return '⚠️ Candidate Identity Mismatch';
                                    }
                                    if (type === 'LOOKING_AWAY') {
                                      return '👀 Gaze Aversion / Looking Away';
                                    }
                                    if (type === 'WINDOW_BLUR' || type === 'PAGE_HIDDEN') {
                                      return '💻 Browser Window Switch / Tab Focus Lost';
                                    }
                                    if (type === 'FULLSCREEN_EXIT') {
                                      return '🖥️ Lockdown Fullscreen Exit';
                                    }
                                    return type;
                                  })()}
                                </span>
                                <Badge variant={inc.severity === 'CRITICAL' ? 'danger' : inc.severity === 'HIGH' ? 'warning' : 'outline'}>
                                  {inc.severity || 'LOW'}
                                </Badge>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
                                  {inc.ai_classification || 'Suspicious'} (conf: {Number((inc?.confidence ?? 0) * 100).toFixed(0)}%)
                                </span>
                                {typeof inc.duration_seconds === 'number' && inc.duration_seconds > 0 && (
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-bold ${
                                    (inc.incident_type === 'TEMPORARY_ABSENCE' || inc.incident_type === 'NO_FACE' || inc.incident_type === 'TEMPORARILY_ABSENT')
                                      ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                      : 'bg-stone-100 text-stone-600'
                                  }`}>
                                    {(inc.incident_type === 'TEMPORARY_ABSENCE' || inc.incident_type === 'NO_FACE' || inc.incident_type === 'TEMPORARILY_ABSENT')
                                      ? `⏱️ Off Screen: ${Number(inc?.duration_seconds ?? 0).toFixed(0)}s`
                                      : `⏱️ ${Number(inc?.duration_seconds ?? 0).toFixed(0)}s`}
                                  </span>
                                )}
                                <span className="text-[11px] text-stone-400 ml-auto">
                                  {inc.started_at ? new Date(inc.started_at).toLocaleTimeString() : ''}
                                </span>
                              </div>

                              <p className="text-stone-600 leading-snug">
                                {inc.ai_explanation || 'Suspicious proctoring pattern flagged by AI engine.'}
                              </p>

                              <div className="flex items-center gap-3 pt-1 text-[11px] text-stone-500">
                                <span>Risk Contribution: <strong>+{Number(inc?.risk_contribution ?? 0).toFixed(1)} pts</strong></span>
                                {inc.review_status && inc.review_status !== 'PENDING' && (
                                  <span className="font-bold text-stone-700">
                                    Review Status: {inc.review_status}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Actions & Evidence */}
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              {(inc.evidence_url || (inc as any).primary_evidence_url) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const rawUrl = inc.evidence_url || (inc as any).primary_evidence_url;
                                    const targetUrl = rawUrl.startsWith('http') || rawUrl.startsWith('/')
                                      ? (rawUrl.startsWith('/') ? `${getApiUrl()}${rawUrl}` : rawUrl)
                                      : continuousProctoringService.getEvidenceImageUrl(rawUrl);
                                    setPreviewImageUrl(targetUrl);
                                  }}
                                  className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 bg-red-50 px-2.5 py-1 rounded-xl border border-red-100"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  <span>View Snapshot</span>
                                </button>
                              )}

                              <div className="flex items-center gap-1.5 mt-1">
                                {!isFalsePositive && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleIncidentReview(inc.incident_id, 'FALSE_POSITIVE')}
                                    disabled={reviewingIncidentId === inc.incident_id}
                                    className="text-[11px] h-7 px-2.5 text-stone-600 hover:text-red-600"
                                  >
                                    False Positive
                                  </Button>
                                )}
                                {!isConfirmed && !isFalsePositive && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleIncidentReview(inc.incident_id, 'CONFIRMED')}
                                    disabled={reviewingIncidentId === inc.incident_id}
                                    className="text-[11px] h-7 px-2.5 text-stone-600 hover:text-emerald-600"
                                  >
                                    Confirm
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                  </div>
                )}
              </div>

              {/* Faculty Final Adjudication Section */}
              <div className="p-5 rounded-2xl bg-stone-50 border border-[#EBE5DC] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-stone-800" />
                    <h3 className="text-sm font-bold font-serif text-stone-900">
                      Faculty Integrity Adjudication Decision
                    </h3>
                  </div>
                  {investigation.decided_at && (
                    <span className="text-[11px] text-stone-500">
                      Decided by {investigation.decided_by_name || 'Faculty'} on{' '}
                      {new Date(investigation.decided_at).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {decisionError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                    {decisionError}
                  </div>
                )}

                {(investigation.auto_disqualification_recommended || investigation.overall_risk_level === 'CRITICAL_RISK' || investigation.overall_risk_level === 'HIGH_RISK') && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-warm-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-bold text-red-900">
                        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <span>AI Automated Integrity Recommendation: DISQUALIFY CANDIDATE</span>
                      </div>
                      <p className="text-red-800 text-[11px] leading-snug">
                        {investigation.auto_disqualification_reason || investigation.ai_recommendation || 'High/Critical risk policy infractions identified during automated analysis.'}
                      </p>
                    </div>
                    {decision !== 'DISQUALIFIED' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setDecision('DISQUALIFIED');
                          setReason(investigation.auto_disqualification_reason || investigation.ai_recommendation || 'Auto-disqualified based on critical examination integrity violations.');
                          setPublishResultOnDecision(false);
                        }}
                        className="text-xs flex-shrink-0 bg-red-600 hover:bg-red-700 text-white border-none font-bold shadow-sm"
                      >
                        Apply AI Disqualification
                      </Button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Adjudication Verdict
                    </label>
                    <select
                      value={decision}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDecision(val);
                        if (val === 'CLEARED') {
                          setPublishResultOnDecision(true);
                        } else if (val === 'DISQUALIFIED' || val === 'VIOLATION_CONFIRMED') {
                          setPublishResultOnDecision(false);
                        }
                      }}
                      className="w-full text-xs font-medium bg-white border border-[#EBE5DC] rounded-xl px-3 py-2.5 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                    >
                      <option value="CLEARED">CLEARED — No Malpractice / Clear Candidate</option>
                      <option value="UNDER_INVESTIGATION">UNDER INVESTIGATION — Defer for Department Committee</option>
                      <option value="VIOLATION_CONFIRMED">VIOLATION CONFIRMED — Record Exam Policy Infraction</option>
                      <option value="DISQUALIFIED">DISQUALIFIED — Disqualify Attempt (Zero Grade & Permanent Mark)</option>
                      <option value="PENDING_REVIEW">PENDING REVIEW — Awaiting Evaluation</option>
                      <option value="INCONCLUSIVE">INCONCLUSIVE — Insufficient Evidentiary Weight</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Justification Reason {(decision === 'DISQUALIFIED' || decision === 'VIOLATION_CONFIRMED') && (
                        <span className="text-red-500">* Required</span>
                      )}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Reviewed visual clips confirming unauthorized proxy assistance..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full text-xs bg-white border border-[#EBE5DC] rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Internal Investigation Notes & Evidence Log (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter relevant timestamps, peer comparisons, or committee review minutes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full text-xs bg-white border border-[#EBE5DC] rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                  />
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-stone-200">
                  <label className={`flex items-center gap-2 select-none text-xs ${decision === 'DISQUALIFIED' ? 'text-stone-400 cursor-not-allowed' : 'text-stone-700 cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={decision === 'DISQUALIFIED' ? false : publishResultOnDecision}
                      disabled={decision === 'DISQUALIFIED'}
                      onChange={(e) => setPublishResultOnDecision(e.target.checked)}
                      className="w-4 h-4 rounded text-stone-800 border-stone-300 focus:ring-stone-400 disabled:opacity-50"
                    />
                    <span>
                      {decision === 'DISQUALIFIED'
                        ? 'Result will be marked DISQUALIFIED (marks suppressed / grade 0)'
                        : 'Publish verified result to student upon applying decision'}
                    </span>
                  </label>

                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={onClose}>
                      Close
                    </Button>
                    <Button
                      size="sm"
                      variant={decision === 'DISQUALIFIED' ? 'danger' : 'primary'}
                      onClick={handleSubmitDecision}
                      disabled={isSubmittingDecision}
                    >
                      {isSubmittingDecision ? 'Saving Verdict...' : `Apply Verdict: ${decision}`}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal for viewing evidence snapshot */}
        {previewImageUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/80 backdrop-blur-sm">
            <div className="bg-white p-4 rounded-3xl max-w-lg w-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-900">Captured Proctoring Evidence Frame</span>
                <button
                  type="button"
                  onClick={() => setPreviewImageUrl(null)}
                  className="text-stone-400 hover:text-stone-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>
              <div className="rounded-2xl overflow-hidden bg-black flex items-center justify-center max-h-[70vh]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImageUrl}
                  alt="Proctoring Incident Snapshot"
                  className="max-h-full object-contain"
                  onError={() => alert('Unable to load full resolution evidence frame.')}
                />
              </div>
              <div className="text-right">
                <Button size="sm" variant="outline" onClick={() => setPreviewImageUrl(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
