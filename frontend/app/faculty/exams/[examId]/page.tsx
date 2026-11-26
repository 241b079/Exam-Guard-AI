'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FileText, Edit, HelpCircle, Upload, Send, Trash2, ArrowLeft, ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle, Award, CheckCircle, Check, X, PenTool, Scale, Clock, ArrowRight } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Exam, examService, ReexamPermissionResponse } from '@/features/exams';
import {
  attemptService,
  AttemptMonitoringResponse,
  ExamGradebookResponse,
  GradebookEntry,
  AttemptReviewResponse,
  FacultyAppealItem,
} from '@/features/attempts';
import {
  useWebRTCFaculty,
  FacultyLiveMonitorCard,
  FacultyEvidenceGallery,
  PostExamInvestigationModal,
  continuousProctoringService,
} from '@/features/proctoring';
import { Loading } from '@/components/shared/Loading';
import { Input } from '@/components/ui/Input';

export default function FacultyExamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.examId as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const [monitoringData, setMonitoringData] = useState<AttemptMonitoringResponse[]>([]);
  const [isLoadingMonitoring, setIsLoadingMonitoring] = useState(false);

  // Gradebook & manual grading state (Bugs 1 & 3)
  const [gradebook, setGradebook] = useState<ExamGradebookResponse | null>(null);
  const [isLoadingGradebook, setIsLoadingGradebook] = useState(false);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [attemptReview, setAttemptReview] = useState<AttemptReviewResponse | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [marksInputs, setMarksInputs] = useState<Record<string, number>>({});
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null);

  // Re-examination permissions state (Loops 14, 29)
  const [permissions, setPermissions] = useState<ReexamPermissionResponse[]>([]);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantScope, setGrantScope] = useState<'SELECTED' | 'ALL'>('SELECTED');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [extraAttempts, setExtraAttempts] = useState(1);
  const [isGranting, setIsGranting] = useState(false);

  // Post-Examination Investigation & Adjudication state
  const [investigationAttemptId, setInvestigationAttemptId] = useState<string | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<
    Array<{ id: string; title: string; description: string; risk_classification: string; student_name?: string }>
  >([]);
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [publishingAttemptId, setPublishingAttemptId] = useState<string | null>(null);
  const [isPublishingAll, setIsPublishingAll] = useState(false);

  // Exam-wise Student Appeals state
  const [examAppeals, setExamAppeals] = useState<FacultyAppealItem[]>([]);
  const [isLoadingAppeals, setIsLoadingAppeals] = useState(false);
  const [appealActionAttemptId, setAppealActionAttemptId] = useState<string | null>(null);

  const fetchExamAppeals = async () => {
    setIsLoadingAppeals(true);
    try {
      const data = await attemptService.getFacultyAppeals({ examId });
      setExamAppeals(data);
    } catch {
      // Non-critical if fails
    } finally {
      setIsLoadingAppeals(false);
    }
  };

  const handleExamAppealDecision = async (attemptId: string, decision: 'APPROVED' | 'REJECTED') => {
    const confirmMsg =
      decision === 'APPROVED'
        ? 'Approve this student appeal? This will clear the disqualification and restore the attempt for grading/publication.'
        : 'Reject this student appeal? The disqualification decision will remain final.';
    if (!window.confirm(confirmMsg)) return;

    setAppealActionAttemptId(attemptId);
    try {
      await attemptService.decideAppeal(attemptId, decision);
      await fetchExamAppeals();
      await fetchMonitoring();
      await fetchGradebook();
    } catch (err: any) {
      alert(err?.message || 'Failed to record appeal decision.');
    } finally {
      setAppealActionAttemptId(null);
    }
  };

  const unpublishedSubmittedCount = React.useMemo(() => {
    return monitoringData.filter(
      (m) =>
        m.status === 'SUBMITTED' &&
        m.publication_status !== 'PUBLISHED' &&
        m.investigation_status !== 'DISQUALIFIED'
    ).length;
  }, [monitoringData]);

  const handlePublishAllResults = async () => {
    if (unpublishedSubmittedCount === 0) {
      alert('No unpublished submitted attempts found to publish.');
      return;
    }
    if (!window.confirm(`Release verified exam results for all ${unpublishedSubmittedCount} candidate(s)?`)) return;
    setIsPublishingAll(true);
    try {
      const res = await examService.publishAllResults(examId);
      alert(res.message || 'Results published successfully for all candidates!');
      await fetchMonitoring();
      await fetchGradebook();
    } catch (err: any) {
      alert(err?.message || 'Failed to publish all results');
    } finally {
      setIsPublishingAll(false);
    }
  };

  const handlePublishAttempt = async (attemptId: string) => {
    setPublishingAttemptId(attemptId);
    try {
      await continuousProctoringService.publishAttemptResult(attemptId);
      await fetchMonitoring();
      await fetchGradebook();
    } catch (err: any) {
      alert(err?.message || 'Failed to publish attempt result');
    } finally {
      setPublishingAttemptId(null);
    }
  };

  const handleHoldAttempt = async (attemptId: string) => {
    const reasonPrompt = window.prompt('Specify reason for holding result publication:', 'Awaiting academic integrity review');
    if (reasonPrompt === null) return;
    setPublishingAttemptId(attemptId);
    try {
      await continuousProctoringService.holdAttemptResult(attemptId, reasonPrompt);
      await fetchMonitoring();
      await fetchGradebook();
    } catch (err: any) {
      alert(err?.message || 'Failed to hold attempt result');
    } finally {
      setPublishingAttemptId(null);
    }
  };

  const filteredMonitoringData = React.useMemo(() => {
    const list = [...monitoringData];

    // Priority sorting: High/Critical first, then Medium, then Low
    list.sort((a, b) => {
      const riskRank = (m: AttemptMonitoringResponse) => {
        const r = (m.overall_risk_level || m.risk_level || '').toUpperCase();
        if (r.includes('CRITICAL')) return 4;
        if (r.includes('HIGH')) return 3;
        if (r.includes('MODERATE') || r.includes('MEDIUM')) return 2;
        return 1;
      };
      const diff = riskRank(b) - riskRank(a);
      if (diff !== 0) return diff;
      const scoreDiff = (b.risk_score || 0) - (a.risk_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      // Secondary tie-breaker: Newest attempt number and submission time first!
      const attemptNumDiff = (b.attempt_number || 0) - (a.attempt_number || 0);
      if (attemptNumDiff !== 0) return attemptNumDiff;
      const dateA = new Date(a.submitted_at || a.started_at || 0).getTime();
      const dateB = new Date(b.submitted_at || b.started_at || 0).getTime();
      return dateB - dateA;
    });

    if (riskFilter === 'HIGH_CRITICAL') {
      return list.filter((m) => {
        const r = (m.overall_risk_level || m.risk_level || '').toUpperCase();
        return r.includes('HIGH') || r.includes('CRITICAL') || (m.risk_score || 0) >= 50;
      });
    }
    if (riskFilter === 'MODERATE') {
      return list.filter((m) => {
        const r = (m.overall_risk_level || m.risk_level || '').toUpperCase();
        return r.includes('MODERATE') || r.includes('MEDIUM') || ((m.risk_score || 0) >= 30 && (m.risk_score || 0) < 50);
      });
    }
    if (riskFilter === 'PENDING') {
      return list.filter((m) => m.investigation_status === 'PENDING_REVIEW' || !m.investigation_status);
    }
    if (riskFilter === 'CONFIRMED') {
      return list.filter((m) => m.investigation_status === 'VIOLATION_CONFIRMED' || m.investigation_status === 'DISQUALIFIED');
    }
    if (riskFilter === 'CLEARED') {
      return list.filter(
        (m) =>
          m.investigation_status === 'CLEARED' ||
          (m.risk_score || 0) === 0 ||
          (m.overall_risk_level || m.risk_level || '').toUpperCase().includes('LOW') ||
          (m.overall_risk_level || '').toUpperCase().includes('NO_SIGNIFICANT')
      );
    }
    if (riskFilter === 'UNPUBLISHED') {
      return list.filter((m) => m.publication_status !== 'PUBLISHED');
    }
    return list;
  }, [monitoringData, riskFilter]);

  const fetchMonitoring = async () => {
    setIsLoadingMonitoring(true);
    try {
      const data = await attemptService.getExamAttemptsMonitoring(examId, false);
      setMonitoringData(data);
    } catch {
      // Ignore if user lacks permissions or network hiccup
    } finally {
      setIsLoadingMonitoring(false);
    }
  };

  // Real-time synchronization handlers for Faculty Live Proctoring
  const handleViolationReceived = React.useCallback((violation: any) => {
    setMonitoringData((prev) => {
      let studentFound = false;
      const next = prev.map((item) => {
        const matches =
          (violation.exam_attempt_id && item.attempt_id === violation.exam_attempt_id) ||
          (violation.attempt_id && item.attempt_id === violation.attempt_id) ||
          (violation.student_id && item.student.id === violation.student_id);

        if (matches) {
          studentFound = true;
          const currentRecent = item.recent_violations || [];
          const exists = currentRecent.some((v) => v.id === violation.id);
          if (exists) {
            return item;
          }
          const updatedRecent = [
            {
              id: violation.id || `v_${Date.now()}`,
              exam_attempt_id: item.attempt_id,
              student_id: item.student.id,
              violation_type: violation.violation_type,
              timestamp: violation.timestamp || new Date().toISOString(),
              metadata_json: violation.metadata_json || violation.metadata || {},
              created_at: violation.created_at || new Date().toISOString(),
            },
            ...currentRecent,
          ].slice(0, 10);

          const extractedFaceCount =
            violation.face_count !== undefined
              ? violation.face_count
              : (violation.metadata_json?.face_count !== undefined
                  ? violation.metadata_json.face_count
                  : item.face_count);

          return {
            ...item,
            violation_count: (item.violation_count || 0) + 1,
            recent_violations: updatedRecent,
            face_count: extractedFaceCount,
            identity_state: violation.violation_type || item.identity_state,
          };
        }
        return item;
      });

      if (!studentFound) {
        fetchMonitoring();
      }

      return next;
    });
  }, [examId]);

  const handlePresenceUpdate = React.useCallback((payload: any) => {
    setMonitoringData((prev) =>
      prev.map((item) => {
        const matches =
          (payload.attempt_id && item.attempt_id === payload.attempt_id) ||
          (payload.student_id && item.student.id === payload.student_id);

        if (matches) {
          return {
            ...item,
            face_count: payload.face_count !== undefined ? payload.face_count : item.face_count,
            identity_state: payload.state || item.identity_state,
            looking_away: payload.looking_away !== undefined ? payload.looking_away : item.looking_away,
            yaw: payload.yaw !== undefined ? payload.yaw : item.yaw,
            pitch: payload.pitch !== undefined ? payload.pitch : item.pitch,
            detected_objects: payload.detected_objects !== undefined ? payload.detected_objects : item.detected_objects,
          };
        }
        return item;
      })
    );
  }, []);

  const handleStudentRejoined = React.useCallback((payload: any) => {
    setMonitoringData((prev) =>
      prev.map((item) => {
        const matches =
          (payload.attempt_id && item.attempt_id === payload.attempt_id) ||
          (payload.student_id && item.student.id === payload.student_id);

        if (matches) {
          return {
            ...item,
            rejoin_count: payload.rejoin_count !== undefined ? payload.rejoin_count : (item.rejoin_count || 0) + 1,
            max_rejoins: payload.max_rejoins !== undefined ? payload.max_rejoins : (item.max_rejoins ?? 2),
            violation_count: payload.violation_count !== undefined ? payload.violation_count : item.violation_count,
            status: payload.status || item.status || 'IN_PROGRESS',
          };
        }
        return item;
      })
    );
  }, []);

  const handleStudentJoined = React.useCallback((payload: any) => {
    setMonitoringData((prev) => {
      const exists = prev.some(
        (item) => item.attempt_id === payload.attempt_id || item.student.id === payload.student_id
      );
      if (!exists) {
        fetchMonitoring();
      }
      return prev;
    });
  }, [examId]);

  const handleStudentSubmitted = React.useCallback((payload: any) => {
    // When a student submits their exam, refresh monitoring immediately so the completed attempt
    // appears in the Risk Scoring list with its final risk score (even if 0.0), and gradebook updates.
    fetchMonitoring();
    fetchGradebook();
  }, [examId]);

  // WebRTC Live Monitoring for Students
  const {
    studentStreams,
    isWsConnected,
    isSfuActive,
    setCandidateStreamQuality,
    refresh: refreshSignaling,
  } = useWebRTCFaculty({
    examId,
    onViolationReceived: handleViolationReceived,
    onStudentRejoined: handleStudentRejoined,
    onStudentJoined: handleStudentJoined,
    onStudentSubmitted: handleStudentSubmitted,
    onPresenceUpdate: handlePresenceUpdate,
    onRiskUpdate: (payload) => {
      setMonitoringData((prev) =>
        prev.map((item) => {
          const matches =
            (payload.attempt_id && item.attempt_id === payload.attempt_id) ||
            (payload.student_id && item.student.id === payload.student_id);
          if (matches) {
            return {
              ...item,
              risk_score: payload.risk_score,
              risk_level: payload.risk_level,
            };
          }
          return item;
        })
      );
    },
    onFacultyAlert: (payload) => {
      setRecentAlerts((prev) => [
        {
          id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: payload.title || 'Cheating Risk Alert',
          description: payload.description || 'Elevated risk detected during examination.',
          risk_classification: payload.risk_level || 'CRITICAL',
          student_name: payload.student_name,
        },
        ...prev.slice(0, 4),
      ]);
    },
  });

  const fetchExam = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await examService.getExamById(examId);
      setExam(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load exam details');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const data = await examService.getReexamPermissions(examId);
      setPermissions(data);
    } catch {
      // Non-critical if fails
    }
  };



  const fetchGradebook = async () => {
    setIsLoadingGradebook(true);
    try {
      const data = await attemptService.getExamGradebook(examId);
      setGradebook(data);
    } catch {
      // Non-critical if fails
    } finally {
      setIsLoadingGradebook(false);
    }
  };

  const openReviewModal = async (attemptId: string) => {
    setSelectedAttemptId(attemptId);
    setIsLoadingReview(true);
    try {
      const data = await attemptService.getAttemptReview(attemptId);
      setAttemptReview(data);
      const initialMarks: Record<string, number> = {};
      data.questions.forEach((q: any) => {
        if (q.answer_id) {
          initialMarks[q.answer_id] = q.marks_awarded ?? 0;
        }
      });
      setMarksInputs(initialMarks);
    } catch (err: any) {
      alert(err.message || 'Failed to load attempt review');
      setSelectedAttemptId(null);
    } finally {
      setIsLoadingReview(false);
    }
  };

  const handleSaveGrade = async (answerId: string, maxMarks: number) => {
    const rawVal = marksInputs[answerId];
    if (rawVal === undefined || isNaN(rawVal)) {
      alert('Please enter a valid numeric mark.');
      return;
    }
    if (rawVal < 0) {
      alert('Marks cannot be negative.');
      return;
    }
    if (rawVal > maxMarks) {
      alert(`Marks cannot exceed the question maximum of ${maxMarks} marks.`);
      return;
    }

    setSavingAnswerId(answerId);
    try {
      const resp = await attemptService.gradeShortAnswer(selectedAttemptId!, answerId, {
        marks_awarded: rawVal,
      });

      // Update current attempt review in modal
      if (attemptReview) {
        setAttemptReview({
          ...attemptReview,
          total_score: resp.attempt_total_score,
          evaluation_status: resp.evaluation_status,
          questions: attemptReview.questions.map((q) =>
            q.answer_id === answerId
              ? { ...q, marks_awarded: resp.marks_awarded, is_correct: resp.marks_awarded > 0 }
              : q
          ),
        });
      }

      // Refresh gradebook table
      await fetchGradebook();
      alert('Grade saved and candidate total score recalculated successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to save grade');
    } finally {
      setSavingAnswerId(null);
    }
  };

  const handleGrantReexam = async () => {
    if (grantScope === 'SELECTED' && selectedStudentIds.length === 0) {
      alert('Please select at least one student to grant re-examination.');
      return;
    }
    setIsGranting(true);
    try {
      await examService.grantReexamPermissions(examId, {
        scope: grantScope,
        student_ids: grantScope === 'SELECTED' ? selectedStudentIds : undefined,
        extra_attempts: extraAttempts,
      });
      alert('Re-examination permission granted successfully.');
      setShowGrantModal(false);
      setSelectedStudentIds([]);
      await fetchPermissions();
    } catch (err: any) {
      alert(err.message || 'Failed to grant re-examination');
    } finally {
      setIsGranting(false);
    }
  };

  useEffect(() => {
    if (examId) {
      fetchExam();
      fetchMonitoring();
      fetchPermissions();
      fetchGradebook();
      fetchExamAppeals();
    }
  }, [examId]);


  const handlePublish = async () => {
    if (!exam) return;
    if (confirm(`Are you sure you want to publish "${exam.title}"? Published exams will become available to students.`)) {
      setIsPublishing(true);
      try {
        await examService.publishExam(examId);
        await fetchExam();
      } catch (err: any) {
        alert(err.message || 'Failed to publish exam');
      } finally {
        setIsPublishing(false);
      }
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this exam?')) {
      try {
        await examService.deleteExam(examId);
        router.push('/faculty/exams');
      } catch (err: any) {
        alert(err.message || 'Failed to delete exam');
      }
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Exam Overview">
        <Loading message="Loading exam parameters..." />
      </DashboardLayout>
    );
  }

  if (error || !exam) {
    return (
      <DashboardLayout title="Exam Overview">
        <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400">
          {error || 'Exam not found'}
        </div>
      </DashboardLayout>
    );
  }

  const statusVariant = exam.status === 'PUBLISHED' ? 'success' : exam.status === 'DRAFT' ? 'faculty' : 'info';

  return (
    <DashboardLayout title={`Manage Exam: ${exam.title}`}>
      <div className="space-y-6">
        <Link href="/faculty/exams" className="inline-flex items-center gap-2 text-xs text-stone-500 hover:text-stone-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to My Exams
        </Link>

        {/* Real-time Faculty Alert Notification Banner */}
        {recentAlerts.length > 0 && (
          <div className="space-y-2">
            {recentAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 shadow-warm flex items-start justify-between gap-4 animate-in fade-in slide-in-from-top-2"
              >
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs uppercase tracking-wider text-red-700">
                        {alert.risk_classification} RISK ALERT
                      </span>
                      {alert.student_name && (
                        <span className="text-xs font-semibold text-stone-800">• {alert.student_name}</span>
                      )}
                    </div>
                    <p className="text-xs text-stone-700 font-medium mt-0.5">{alert.title}</p>
                    <p className="text-xs text-stone-600 mt-0.5">{alert.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRecentAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
                  className="text-stone-400 hover:text-stone-600 text-xs font-bold p-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Header Action Bar */}
        <div className="p-6 md:p-8 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-serif text-stone-900">{exam.title}</h1>
              <Badge variant={statusVariant}>{exam.status}</Badge>
            </div>
            {exam.description && <p className="text-xs text-stone-500">{exam.description}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/faculty/exams/${examId}/questions`}>
              <Button variant="primary" size="sm" className="gap-1.5 text-xs">
                <HelpCircle className="w-4 h-4" /> Questions ({exam.question_count})
              </Button>
            </Link>

            <Link href={`/faculty/exams/${examId}/import`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Upload className="w-4 h-4" /> Import Questions
              </Button>
            </Link>

            <Link href={`/faculty/exams/${examId}/edit`}>
              <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
                <Edit className="w-4 h-4" /> Edit Configuration
              </Button>
            </Link>

            {exam.status === 'DRAFT' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handlePublish}
                isLoading={isPublishing}
                className="gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-800"
              >
                <Send className="w-4 h-4" /> Publish Exam
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 p-2"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="space-y-3">
            <span className="text-[11px] font-semibold uppercase text-stone-500">Duration & Marks</span>
            <div className="space-y-2 text-sm text-stone-700">
              <div className="flex justify-between">
                <span>Duration:</span>
                <strong className="text-[#C25E1A]">{exam.duration_minutes} Mins</strong>
              </div>
              <div className="flex justify-between">
                <span>Total Questions:</span>
                <strong className="text-stone-900">{exam.question_count}</strong>
              </div>
              <div className="flex justify-between">
                <span>Total Marks:</span>
                <strong className="text-stone-900">{exam.total_marks} Marks</strong>
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <span className="text-[11px] font-semibold uppercase text-stone-500">Exam Rules & Settings</span>
            <div className="space-y-2 text-sm text-stone-700">
              <div className="flex justify-between">
                <span>Negative Marking:</span>
                <strong className="text-stone-900">{exam.negative_marking}</strong>
              </div>
              <div className="flex justify-between">
                <span>Auto Submit:</span>
                <strong className="text-stone-900">{exam.auto_submit ? 'Yes' : 'No'}</strong>
              </div>
              <div className="flex justify-between">
                <span>Display Countdown:</span>
                <strong className="text-stone-900">{exam.display_countdown ? 'Yes' : 'No'}</strong>
              </div>
              <div className="flex justify-between">
                <span>Result Release:</span>
                <strong className={exam.auto_publish_results ? 'text-emerald-700' : 'text-stone-900'}>
                  {exam.auto_publish_results ? 'Immediate on Submit' : 'Manual Faculty Release'}
                </strong>
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <span className="text-[11px] font-semibold uppercase text-stone-500">Target Assignment</span>
            <div className="space-y-2 text-sm text-stone-700">
              <div className="flex justify-between">
                <span>Assignment Type:</span>
                <strong className="text-stone-900">{exam.assignment_type}</strong>
              </div>
              <div className="flex justify-between">
                <span>Availability:</span>
                <strong className="text-stone-900">{exam.availability_type}</strong>
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <span className="text-[11px] font-semibold uppercase text-stone-500">Attempt & Rejoin Policy</span>
            <div className="space-y-2 text-sm text-stone-700">
              <div className="flex justify-between">
                <span>Policy:</span>
                <strong className="text-stone-900">{exam.attempt_policy || 'ONE_ATTEMPT'}</strong>
              </div>
              <div className="flex justify-between">
                <span>Max Attempts:</span>
                <strong className="text-stone-900">{exam.max_attempts || 1}</strong>
              </div>
              <div className="flex justify-between">
                <span>Max Rejoins:</span>
                <strong className="text-amber-800">{exam.max_rejoins ?? 2} Allowed</strong>
              </div>
            </div>
          </Card>
        </div>

        {/* Re-examination Management Section (Loops 14, 29) */}
        <div className="p-6 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold font-serif text-stone-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#C25E1A]" />
                Re-examination & Additional Attempt Permissions
              </h2>
              <p className="text-xs text-stone-500">
                Grant permission for specific or all students to take an additional attempt beyond the standard policy.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowGrantModal(true)}
              className="text-xs shadow-warm-sm gap-1.5"
            >
              + Grant Re-examination
            </Button>
          </div>

          {permissions.length === 0 ? (
            <p className="text-xs text-stone-500 italic py-2">
              No additional re-examination permissions have been granted for this exam. Standard attempt policy applies.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-stone-700">
                <thead className="bg-[#FAF7F2] text-stone-500 font-semibold border-b border-[#EBE5DC]">
                  <tr>
                    <th className="py-2.5 px-3">Student Name / Email</th>
                    <th className="py-2.5 px-3">Student Roll ID</th>
                    <th className="py-2.5 px-3">Extra Attempts</th>
                    <th className="py-2.5 px-3">Consumed</th>
                    <th className="py-2.5 px-3">Remaining</th>
                    <th className="py-2.5 px-3">Granted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE5DC]">
                  {permissions.map((p) => (
                    <tr key={p.id} className="hover:bg-[#FAF7F2]/50">
                      <td className="py-2.5 px-3 font-medium text-stone-900">
                        {p.student_name || p.student_email || (p.student_id ? p.student_id : 'All Students')}
                      </td>
                      <td className="py-2.5 px-3 text-stone-600">{p.student_roll_number || '—'}</td>
                      <td className="py-2.5 px-3 font-semibold text-stone-900">{p.extra_attempts_allowed}</td>
                      <td className="py-2.5 px-3 text-stone-600">{p.attempts_consumed}</td>
                      <td className="py-2.5 px-3">
                        <span className={`font-bold px-2 py-0.5 rounded-full ${p.remaining_attempts > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>
                          {p.remaining_attempts}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-stone-500">{new Date(p.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Grant Re-examination Modal */}
        {showGrantModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-3xl p-6 border border-[#EBE5DC] shadow-warm max-w-md w-full space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
                <h3 className="font-bold font-serif text-stone-900 text-base">Grant Re-examination</h3>
                <button onClick={() => setShowGrantModal(false)} className="text-stone-400 hover:text-stone-700 text-sm">✕</button>
              </div>

              <div className="space-y-4 text-xs">
                <div className="space-y-2">
                  <label className="font-semibold text-stone-800 block">Permission Scope</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                      <input
                        type="radio"
                        checked={grantScope === 'SELECTED'}
                        onChange={() => setGrantScope('SELECTED')}
                        className="accent-[#C25E1A]"
                      />
                      Selected Candidates
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                      <input
                        type="radio"
                        checked={grantScope === 'ALL'}
                        onChange={() => setGrantScope('ALL')}
                        className="accent-[#C25E1A]"
                      />
                      All Students
                    </label>
                  </div>
                </div>

                {grantScope === 'SELECTED' && (
                  <div className="space-y-2">
                    <label className="font-semibold text-stone-800 block">Select Students</label>
                    <div className="max-h-48 overflow-y-auto p-2 bg-[#FAF7F2] border border-[#EBE5DC] rounded-xl space-y-1.5">
                      {(() => {
                        const candidateMap = new Map<string, { id: string; name: string; email: string }>();
                        if (gradebook?.entries) {
                          gradebook.entries.forEach((e) => {
                            if (e.student?.id) {
                              candidateMap.set(e.student.id, {
                                id: e.student.id,
                                name: e.student.name,
                                email: e.student.email,
                              });
                            }
                          });
                        }
                        monitoringData.forEach((att) => {
                          if (att.student?.id) {
                            candidateMap.set(att.student.id, {
                              id: att.student.id,
                              name: att.student.name,
                              email: att.student.email,
                            });
                          }
                        });
                        const candidateList = Array.from(candidateMap.values());

                        if (candidateList.length === 0) {
                          return <p className="text-stone-400 italic p-1">No candidate records available yet.</p>;
                        }

                        return candidateList.map((cand) => {
                          const isChecked = selectedStudentIds.includes(cand.id);
                          return (
                            <label key={cand.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStudentIds([...selectedStudentIds, cand.id]);
                                  } else {
                                    setSelectedStudentIds(selectedStudentIds.filter(id => id !== cand.id));
                                  }
                                }}
                                className="accent-[#C25E1A]"
                              />
                              <span className="font-medium text-stone-800">{cand.name}</span>
                              <span className="text-[10px] text-stone-500">({cand.email})</span>
                            </label>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="font-semibold text-stone-800 block">Additional Attempts to Grant</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={extraAttempts}
                    onChange={(e) => setExtraAttempts(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#EBE5DC]">
                <Button variant="secondary" size="sm" onClick={() => setShowGrantModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleGrantReexam} isLoading={isGranting}>
                  Grant Permission
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Exam-wise Student Appeals Section */}
        <div className="p-6 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold font-serif text-stone-900 flex items-center gap-2">
                <Scale className="w-5 h-5 text-[#C25E1A]" />
                Student Academic Integrity Appeals
                {examAppeals.filter((a) => a.appeal_status === 'PENDING_REVIEW').length > 0 && (
                  <Badge variant="warning" className="text-[10px]">
                    {examAppeals.filter((a) => a.appeal_status === 'PENDING_REVIEW').length} Pending Review
                  </Badge>
                )}
              </h2>
              <p className="text-xs text-stone-500">
                Appeals submitted by candidates for this exam, ordered with the most recent appeal first.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchExamAppeals}
                isLoading={isLoadingAppeals}
                className="text-xs gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
              <Link href="/faculty/appeals">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                  All Appeals <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>

          {isLoadingAppeals && examAppeals.length === 0 ? (
            <div className="py-4 text-center text-xs text-stone-500">Loading exam appeals...</div>
          ) : examAppeals.length === 0 ? (
            <div className="p-4 text-center rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC] text-xs text-stone-500 italic">
              No student appeals have been submitted for this exam.
            </div>
          ) : (
            <div className="space-y-3">
              {examAppeals.map((appeal) => {
                const isPending = appeal.appeal_status === 'PENDING_REVIEW';
                const isApproved = appeal.appeal_status === 'APPROVED';
                const isBusy = appealActionAttemptId === appeal.attempt_id;

                return (
                  <div
                    key={appeal.attempt_id}
                    className={`p-4 rounded-2xl border space-y-3 ${
                      isPending
                        ? 'bg-amber-50/50 border-amber-200'
                        : isApproved
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-rose-50/40 border-rose-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-stone-900">{appeal.student.name}</span>
                        {appeal.student.roll_number && (
                          <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-[#EBE5DC] text-stone-600">
                            {appeal.student.roll_number}
                          </span>
                        )}
                        <span className="text-stone-500">• Attempt #{appeal.attempt_number}</span>
                        {appeal.appeal_submitted_at && (
                          <span className="text-stone-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(appeal.appeal_submitted_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <Badge
                        variant={isApproved ? 'success' : isPending ? 'warning' : 'danger'}
                        className="text-[10px] self-start sm:self-auto"
                      >
                        {isPending ? 'PENDING REVIEW' : appeal.appeal_status}
                      </Badge>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-[#EBE5DC] text-xs text-stone-800 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                        Appeal Statement
                      </span>
                      <p className="leading-relaxed whitespace-pre-wrap">
                        {appeal.appeal_reason || 'No appeal message provided.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setInvestigationAttemptId(appeal.attempt_id)}
                        className="text-xs gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" /> Inspect Investigation
                      </Button>

                      {isPending && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleExamAppealDecision(appeal.attempt_id, 'REJECTED')}
                            disabled={isBusy}
                            className="text-xs gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            {isBusy ? 'Saving...' : 'Reject'}
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleExamAppealDecision(appeal.attempt_id, 'APPROVED')}
                            disabled={isBusy}
                            className="text-xs gap-1 bg-emerald-700 hover:bg-emerald-800 text-white"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {isBusy ? 'Saving...' : 'Approve & Clear'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Candidate Results & Gradebook Section (Bug 1 & Bug 3) */}
        <div className="p-6 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold font-serif text-stone-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-[#C25E1A]" />
                Candidate Submissions & Gradebook
              </h2>
              <p className="text-xs text-stone-500">
                View submitted candidate exam results, auto-graded MCQ scores, and manually grade descriptive/short-answer questions.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchGradebook}
              isLoading={isLoadingGradebook}
              className="text-xs gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Gradebook
            </Button>
          </div>

          {isLoadingGradebook && !gradebook ? (
            <div className="py-6 text-center text-xs text-stone-500">Loading student grades...</div>
          ) : !gradebook || gradebook.entries.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC] text-xs text-stone-500 italic">
              No student submissions recorded for this exam yet.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC]">
                  <span className="text-stone-500 block">Total Submissions</span>
                  <span className="text-lg font-bold font-serif text-stone-900">{gradebook.total_submissions}</span>
                </div>
                <div className="p-3 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC]">
                  <span className="text-stone-500 block">Total Exam Marks</span>
                  <span className="text-lg font-bold font-serif text-[#C25E1A]">{gradebook.total_marks}</span>
                </div>
                <div className="p-3 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC]">
                  <span className="text-stone-500 block">Fully Evaluated</span>
                  <span className="text-lg font-bold font-serif text-emerald-800">
                    {gradebook.entries.filter((e) => e.evaluation_status === 'EVALUATED').length} / {gradebook.entries.length}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC]">
                  <span className="text-stone-500 block">Needs Grading</span>
                  <span className="text-lg font-bold font-serif text-amber-800">
                    {gradebook.entries.filter((e) => e.evaluation_status !== 'EVALUATED').length}
                  </span>
                </div>
              </div>

              {/* Submissions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-stone-700">
                  <thead className="bg-[#FAF7F2] text-stone-500 font-semibold border-b border-[#EBE5DC]">
                    <tr>
                      <th className="py-2.5 px-3">Candidate</th>
                      <th className="py-2.5 px-3">Roll ID</th>
                      <th className="py-2.5 px-3">Attempt</th>
                      <th className="py-2.5 px-3">Submitted At</th>
                      <th className="py-2.5 px-3">Score</th>
                      <th className="py-2.5 px-3">Percentage</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBE5DC]">
                    {gradebook.entries.map((entry) => (
                      <tr key={entry.attempt_id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-stone-900">
                          <div>{entry.student.name}</div>
                          <div className="text-[10px] text-stone-500">{entry.student.email}</div>
                        </td>
                        <td className="py-2.5 px-3 text-stone-600 font-mono text-[11px]">
                          {entry.student.roll_number || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-stone-600">#{entry.attempt_number}</td>
                        <td className="py-2.5 px-3 text-stone-500">
                          {entry.submitted_at ? new Date(entry.submitted_at).toLocaleString() : 'In Progress'}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-stone-900">
                          {entry.total_score} <span className="font-normal text-stone-400">/ {entry.max_possible_score}</span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-stone-900">{entry.percentage}%</td>
                        <td className="py-2.5 px-3">
                          <Badge variant={entry.evaluation_status === 'EVALUATED' ? 'success' : 'student'}>
                            {entry.evaluation_status === 'EVALUATED' ? 'Evaluated' : 'Needs Grading'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openReviewModal(entry.attempt_id)}
                            className="text-[11px] py-1 px-3 gap-1 shadow-warm-sm"
                          >
                            <PenTool className="w-3 h-3" /> Review & Grade
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Candidate Assessment Review & Manual Grading Modal (Bug 3) */}
        {selectedAttemptId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl p-6 border border-[#EBE5DC] shadow-warm max-w-3xl w-full space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-[#EBE5DC]">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-[#C25E1A]" />
                  <h3 className="font-bold font-serif text-stone-900 text-base">
                    Candidate Attempt Review & Manual Grading
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setSelectedAttemptId(null);
                    setAttemptReview(null);
                  }}
                  className="text-stone-400 hover:text-stone-700 text-sm font-bold p-1"
                >
                  ✕
                </button>
              </div>

              {isLoadingReview || !attemptReview ? (
                <div className="py-12">
                  <Loading message="Loading candidate answers and response records..." />
                </div>
              ) : (
                <div className="space-y-5 text-xs">
                  {/* Candidate Overview Card */}
                  <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC] grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-stone-500 uppercase text-[10px] block font-semibold">Candidate</span>
                      <strong className="text-stone-900 text-sm block">{attemptReview.student.name}</strong>
                      <span className="text-stone-500 text-[10px]">{attemptReview.student.email}</span>
                    </div>
                    <div>
                      <span className="text-stone-500 uppercase text-[10px] block font-semibold">Submission</span>
                      <span className="text-stone-900 font-medium block">Attempt #{attemptReview.attempt_number}</span>
                      <span className="text-stone-500 text-[10px]">
                        {attemptReview.submitted_at ? new Date(attemptReview.submitted_at).toLocaleTimeString() : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 uppercase text-[10px] block font-semibold">Total Score</span>
                      <span className="text-base font-bold font-serif text-[#C25E1A] block">
                        {attemptReview.total_score} / {attemptReview.max_possible_score}
                      </span>
                      <span className="text-stone-500 text-[10px]">({attemptReview.percentage}%)</span>
                    </div>
                    <div>
                      <span className="text-stone-500 uppercase text-[10px] block font-semibold">Grading Status</span>
                      <div className="pt-1">
                        <Badge variant={attemptReview.evaluation_status === 'EVALUATED' ? 'success' : 'student'}>
                          {attemptReview.evaluation_status === 'EVALUATED' ? 'Evaluated' : 'Needs Review'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Question Responses & Grading */}
                  <div className="space-y-4">
                    <h4 className="font-bold font-serif text-stone-900 text-sm pb-1 border-b border-[#EBE5DC]">
                      Question Responses ({attemptReview.questions.length})
                    </h4>

                    {attemptReview.questions.map((q, idx) => {
                      const isMCQ = q.question_type === 'MCQ';
                      const isShort = q.question_type === 'SHORT_ANSWER';
                      const answerId = q.answer_id;

                      return (
                        <div
                          key={q.question_id}
                          className="p-4 bg-white rounded-2xl border border-[#EBE5DC] shadow-warm-sm space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-[#FAF7F2] border border-[#EBE5DC] text-stone-700 text-[10px] font-bold flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {isMCQ ? 'MCQ (Auto-Graded)' : 'Short Answer / Descriptive'}
                              </Badge>
                            </div>
                            <span className="text-xs font-semibold text-stone-600">
                              Max Marks: {q.max_marks}
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-stone-900">{q.question_text}</p>

                          {/* MCQ Response Review */}
                          {isMCQ && (
                            <div className="space-y-1.5 p-3 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC]">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-stone-600">Candidate Selected:</span>
                                <span
                                  className={`font-semibold flex items-center gap-1 ${
                                    q.is_correct ? 'text-emerald-800' : 'text-rose-700'
                                  }`}
                                >
                                  {q.is_correct ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                                  {q.selected_option || 'None (Not attempted)'}
                                </span>
                              </div>
                              {q.correct_answer && (
                                <div className="flex justify-between items-center text-xs text-stone-500">
                                  <span>Correct Answer:</span>
                                  <span className="font-medium text-stone-800">{q.correct_answer}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center text-xs pt-1 border-t border-[#EBE5DC]">
                                <span className="text-stone-500">Auto-Awarded Score:</span>
                                <strong className="text-stone-900">{q.marks_awarded ?? 0} / {q.max_marks}</strong>
                              </div>
                            </div>
                          )}

                          {/* Short Answer Response & Manual Grading Form */}
                          {isShort && (
                            <div className="space-y-3 p-3.5 rounded-xl bg-[#FAF7F2] border border-[#EBE5DC]">
                              <div>
                                <span className="text-stone-600 font-semibold block text-[11px]">
                                  Candidate's Written Answer:
                                </span>
                                <div className="mt-1 p-3 bg-white rounded-xl border border-[#EBE5DC] text-stone-800 whitespace-pre-wrap leading-relaxed">
                                  {q.answer_text && q.answer_text.trim() ? (
                                    q.answer_text
                                  ) : (
                                    <span className="text-stone-400 italic">No written answer submitted.</span>
                                  )}
                                </div>
                              </div>

                              {q.correct_answer && (
                                <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-[11px] text-emerald-900">
                                  <strong>Expected Answer / Key Points:</strong> {q.correct_answer}
                                </div>
                              )}

                              {answerId ? (
                                <div className="pt-2 border-t border-[#EBE5DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <label className="font-semibold text-stone-800 text-xs">
                                      Award Marks (0 – {q.max_marks}):
                                    </label>
                                    <input
                                      type="number"
                                      step="0.25"
                                      min={0}
                                      max={q.max_marks}
                                      value={marksInputs[answerId] ?? ''}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setMarksInputs({
                                          ...marksInputs,
                                          [answerId]: isNaN(val) ? 0 : val,
                                        });
                                      }}
                                      className="w-20 px-2.5 py-1.5 text-xs bg-white rounded-lg border border-[#EBE5DC] font-semibold text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#C25E1A]"
                                    />
                                    <span className="text-stone-400 text-xs">/ {q.max_marks}</span>
                                  </div>

                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleSaveGrade(answerId, q.max_marks)}
                                    isLoading={savingAnswerId === answerId}
                                    className="gap-1.5 text-xs bg-[#C25E1A] hover:bg-[#A94F13]"
                                  >
                                    <PenTool className="w-3.5 h-3.5" /> Save Grade
                                  </Button>
                                </div>
                              ) : (
                                <div className="text-stone-400 italic text-[11px]">
                                  No answer record available to grade.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-[#EBE5DC]">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedAttemptId(null);
                    setAttemptReview(null);
                  }}
                >
                  Close Review
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Candidate Integrity & Attempt Monitoring Section */}
        <div className="space-y-4 pt-6 border-t border-[#EBE5DC]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#C25E1A]" />
              <h2 className="text-lg font-bold font-serif text-stone-900">
                Candidate Integrity & Live Media Monitoring
              </h2>
              {isSfuActive ? (
                <span className="text-[10px] font-bold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-full border border-cyan-300 flex items-center gap-1 shadow-xs" title="LiveKit SFU Dynacast: Ingests candidate video once and forwards dynamic low-bitrate thumbnails or 720p HD">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  ⚡ SFU Dynacast Active
                </span>
              ) : (
                <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                  P2P Mesh Mode
                </span>
              )}
              {isWsConnected && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Signaling Connected
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchMonitoring();
                refreshSignaling();
              }}
              isLoading={isLoadingMonitoring}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Live Feed
            </Button>
          </div>

          {(() => {
            const isExamActive =
              exam?.status === 'PUBLISHED' &&
              (exam?.availability_type !== 'SCHEDULED' ||
                ((!exam.start_time || new Date() >= new Date(exam.start_time)) &&
                  (!exam.end_time || new Date() <= new Date(exam.end_time))));

            const activeLiveCandidates = monitoringData.filter(
              (att) => att.status === 'IN_PROGRESS'
            );

            if (!isExamActive) {
              return (
                <Card className="p-8 text-center space-y-2 bg-[#FAF7F2] border border-[#EBE5DC]">
                  <p className="text-sm font-semibold text-stone-700">
                    Examination is currently closed or outside its scheduled availability window.
                  </p>
                  <p className="text-xs text-stone-500">
                    Live candidate video streams and media monitoring are only active while an examination is open and published.
                  </p>
                </Card>
              );
            }

            if (activeLiveCandidates.length === 0) {
              return (
                <Card className="p-8 text-center space-y-2 bg-white border border-[#EBE5DC]">
                  <p className="text-sm font-semibold text-stone-800">
                    No candidates are currently taking this exam live.
                  </p>
                  <p className="text-xs text-stone-500">
                    Live candidate cards will appear here as soon as a student starts their attempt, and are automatically removed once they submit or auto-submit.
                  </p>
                </Card>
              );
            }

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {activeLiveCandidates.map((att) => (
                  <FacultyLiveMonitorCard
                    key={att.attempt_id}
                    monitoring={att}
                    mediaTracks={studentStreams[att.student.id]}
                    onFocusChange={(studentId, isFocused) => {
                      setCandidateStreamQuality(studentId, isFocused ? 'high' : 'low');
                    }}
                    onInspectInvestigation={(attId) => {
                      setInvestigationAttemptId(attId);
                    }}
                  />
                ))}
              </div>
            );
          })()}
        </div>

        {/* AI Cheating Detection, Dynamic Risk Scoring & Post-Examination Adjudication */}
        <div className="pt-6 border-t border-[#EBE5DC] space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-red-50 text-red-700 border border-red-200">
                  <ShieldAlert className="w-4 h-4" />
                </span>
                <h2 className="text-lg font-bold font-serif text-stone-900">
                  AI Cheating Detection, Risk Scoring & Integrity Adjudication
                </h2>
              </div>
              <p className="text-xs text-stone-500">
                Audited evidence-based risk assessment (0-100). Detecting suspicious activity never automatically interrupts or disqualifies candidates.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMonitoring}
              className="text-xs gap-1 self-start md:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Risk Scores
            </Button>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
            <div className="p-3 rounded-2xl bg-stone-50 border border-[#EBE5DC]">
              <div className="text-xl font-bold text-stone-800">{monitoringData.length}</div>
              <div className="text-[10px] uppercase font-bold text-stone-400">Total Attempts</div>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
              <div className="text-xl font-bold text-emerald-700">
                {monitoringData.filter((m) => (m.risk_score || 0) < 30).length}
              </div>
              <div className="text-[10px] uppercase font-bold text-emerald-600">Low Risk (0-29)</div>
            </div>
            <div className="p-3 rounded-2xl bg-yellow-50 border border-yellow-100">
              <div className="text-xl font-bold text-yellow-700">
                {monitoringData.filter((m) => (m.risk_score || 0) >= 30 && (m.risk_score || 0) < 50).length}
              </div>
              <div className="text-[10px] uppercase font-bold text-yellow-600">Medium (30-49)</div>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100">
              <div className="text-xl font-bold text-amber-700">
                {monitoringData.filter((m) => (m.risk_score || 0) >= 50 && (m.risk_score || 0) < 75).length}
              </div>
              <div className="text-[10px] uppercase font-bold text-amber-600">High (50-74)</div>
            </div>
            <div className="p-3 rounded-2xl bg-red-50 border border-red-100">
              <div className="text-xl font-bold text-red-700">
                {monitoringData.filter((m) => (m.risk_score || 0) >= 75).length}
              </div>
              <div className="text-[10px] uppercase font-bold text-red-600">Critical (75-100)</div>
            </div>
            <div className="p-3 rounded-2xl bg-stone-100 border border-stone-200">
              <div className="text-xl font-bold text-stone-700">
                {monitoringData.filter((m) => m.investigation_status === 'DISQUALIFIED').length}
              </div>
              <div className="text-[10px] uppercase font-bold text-stone-500">Disqualified</div>
            </div>
          </div>

          {/* Candidate Risk Scores & Investigation Table */}
          <div className="bg-white rounded-3xl border border-[#EBE5DC] overflow-hidden shadow-warm space-y-3 p-4">
            {/* Filter Tabs & Bulk Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-stone-100">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
                {[
                  { id: 'ALL', label: 'All Attempts' },
                  { id: 'HIGH_CRITICAL', label: 'High / Critical Risk' },
                  { id: 'MODERATE', label: 'Moderate Risk' },
                  { id: 'PENDING', label: 'Pending Review' },
                  { id: 'CONFIRMED', label: 'Confirmed Violations' },
                  { id: 'CLEARED', label: 'Cleared' },
                  { id: 'UNPUBLISHED', label: 'Awaiting Publication' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRiskFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition-colors whitespace-nowrap ${
                      riskFilter === tab.id
                        ? 'bg-stone-900 text-white shadow-warm-sm'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
                    }`}
                  >
                    {tab.label}
                    {tab.id === 'ALL' && ` (${monitoringData.length})`}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handlePublishAllResults}
                  disabled={isPublishingAll || unpublishedSubmittedCount === 0}
                  className="gap-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white border-none shadow-warm-sm disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isPublishingAll
                    ? 'Publishing All Results...'
                    : `Publish All Results (${unpublishedSubmittedCount} Pending)`}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto -mx-4 -mb-4">
              <table className="w-full text-xs text-left text-stone-700">
                <thead className="bg-[#FAF7F2] text-[11px] uppercase tracking-wider text-stone-500 font-semibold border-b border-[#EBE5DC]">
                  <tr>
                    <th className="py-3 px-4">Candidate</th>
                    <th className="py-3 px-4">Exam Status</th>
                    <th className="py-3 px-4">AI Integrity Risk</th>
                    <th className="py-3 px-4">Evidence</th>
                    <th className="py-3 px-4">Result Publication</th>
                    <th className="py-3 px-4">Evaluated Score</th>
                    <th className="py-3 px-4">Adjudication</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE5DC]">
                  {filteredMonitoringData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-stone-400">
                        No candidate attempts match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredMonitoringData.map((att) => {
                      const score = att.risk_score || 0;
                      const level = (att.overall_risk_level || att.risk_level || (score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW')).toUpperCase();
                      const invStatus = att.investigation_status || 'PENDING_REVIEW';
                      const pubStatus = att.publication_status || 'UNPUBLISHED';
                      const isPub = pubStatus === 'PUBLISHED';
                      const isBusy = publishingAttemptId === att.attempt_id;

                      return (
                        <tr key={att.attempt_id} className="hover:bg-stone-50/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-stone-900">{att.student.name}</div>
                            <div className="text-[11px] text-stone-500">
                              {att.student.roll_number ? `${att.student.roll_number} • ` : ''}
                              {att.student.email}
                            </div>
                            <div className="text-[10px] text-stone-400 mt-0.5">
                              Attempt #{att.attempt_number || 1}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={att.status === 'SUBMITTED' ? 'success' : 'faculty'}>
                              {att.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-block ${
                                  level.includes('CRITICAL')
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : level.includes('HIGH')
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : level.includes('MODERATE') || level.includes('MEDIUM')
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {att.overall_risk_level || level}
                              </span>
                              <div className="text-[11px] text-stone-500">
                                Score: <strong>{score.toFixed(1)}</strong> / 100
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-0.5 text-[11px]">
                              <div>High Conf: <strong className="text-red-700">{att.high_confidence_count ?? 0}</strong></div>
                              <div>Suspicious: <strong className="text-amber-700">{att.suspicious_count ?? 0}</strong></div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={
                                pubStatus === 'PUBLISHED'
                                  ? 'success'
                                  : pubStatus === 'DISQUALIFIED'
                                  ? 'danger'
                                  : pubStatus === 'HELD'
                                  ? 'warning'
                                  : 'outline'
                              }
                              className="text-[10px]"
                            >
                              {pubStatus}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-xs font-bold text-stone-900">
                              {att.evaluated_score !== null && att.evaluated_score !== undefined ? (
                                <>
                                  {invStatus === 'DISQUALIFIED' ? 0 : att.evaluated_score}{' '}
                                  <span className="text-[10px] font-normal text-stone-400">
                                    / {att.max_possible_score || 0}
                                  </span>
                                </>
                              ) : (
                                <span className="text-stone-400 italic font-normal">Pending</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col items-start gap-1">
                              {invStatus === 'DISQUALIFIED' ? (
                                <Badge variant="danger">DISQUALIFIED</Badge>
                              ) : invStatus === 'VIOLATION_CONFIRMED' ? (
                                <Badge variant="danger">VIOLATION CONFIRMED</Badge>
                              ) : invStatus === 'CLEARED' ? (
                                <Badge variant="success">CLEARED</Badge>
                              ) : invStatus === 'UNDER_INVESTIGATION' ? (
                                <Badge variant="warning">UNDER INVESTIGATION</Badge>
                              ) : (
                                <Badge variant="outline">PENDING REVIEW</Badge>
                              )}
                              {att.appeal_status === 'PENDING_REVIEW' && (
                                <Badge variant="warning" className="text-[10px]">
                                  Appeal Pending
                                </Badge>
                              )}
                              {att.appeal_status === 'APPROVED' && (
                                <Badge variant="success" className="text-[10px]">
                                  Appeal Approved
                                </Badge>
                              )}
                              {att.appeal_status === 'REJECTED' && (
                                <Badge variant="danger" className="text-[10px]">
                                  Appeal Rejected
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setInvestigationAttemptId(att.attempt_id)}
                                className="text-xs gap-1"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Inspect</span>
                              </Button>

                              {invStatus === 'DISQUALIFIED' || pubStatus === 'DISQUALIFIED' ? (
                                <Badge variant="danger" className="text-[10px] py-1 px-2">
                                  Grade 0 Locked
                                </Badge>
                              ) : !isPub ? (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handlePublishAttempt(att.attempt_id)}
                                  disabled={isBusy}
                                  className="text-[11px] h-7 px-2"
                                >
                                  {isBusy ? '...' : 'Publish'}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleHoldAttempt(att.attempt_id)}
                                  disabled={isBusy}
                                  className="text-[11px] h-7 px-2 text-amber-700 border-amber-300 hover:bg-amber-50"
                                >
                                  {isBusy ? '...' : 'Hold'}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Proctoring Evidence & Identity Incident Review Gallery */}
        <div className="pt-6 border-t border-[#EBE5DC]">
          <FacultyEvidenceGallery examId={examId} examTitle={exam?.title} />
        </div>

        {/* Post-Examination AI Investigation & Adjudication Modal */}
        <PostExamInvestigationModal
          isOpen={!!investigationAttemptId}
          onClose={() => setInvestigationAttemptId(null)}
          examId={examId}
          attemptId={investigationAttemptId || ''}
          onDecisionApplied={() => {
            fetchMonitoring();
            fetchGradebook();
            fetchExamAppeals();
          }}
        />
      </div>
    </DashboardLayout>
  );
}
