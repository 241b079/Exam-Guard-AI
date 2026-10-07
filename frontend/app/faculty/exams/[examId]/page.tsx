'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FileText, Edit, HelpCircle, Upload, Send, Trash2, ArrowLeft, ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle, Award, CheckCircle, Check, X, PenTool } from 'lucide-react';
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
} from '@/features/attempts';
import { useWebRTCFaculty, FacultyLiveMonitorCard, FacultyEvidenceGallery } from '@/features/proctoring';
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

  const fetchMonitoring = async () => {
    setIsLoadingMonitoring(true);
    try {
      const data = await attemptService.getExamAttemptsMonitoring(examId);
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

          return {
            ...item,
            violation_count: (item.violation_count || 0) + 1,
            recent_violations: updatedRecent,
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

  // WebRTC Live Monitoring for Students
  const { studentStreams, isWsConnected, refresh: refreshSignaling } = useWebRTCFaculty({
    examId,
    onViolationReceived: handleViolationReceived,
    onStudentRejoined: handleStudentRejoined,
    onStudentJoined: handleStudentJoined,
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
                      {monitoringData.length === 0 ? (
                        <p className="text-stone-400 italic p-1">No candidate records available yet.</p>
                      ) : (
                        monitoringData.map((att) => {
                          const isChecked = selectedStudentIds.includes(att.student.id);
                          return (
                            <label key={att.student.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStudentIds([...selectedStudentIds, att.student.id]);
                                  } else {
                                    setSelectedStudentIds(selectedStudentIds.filter(id => id !== att.student.id));
                                  }
                                }}
                                className="accent-[#C25E1A]"
                              />
                              <span className="font-medium text-stone-800">{att.student.name}</span>
                              <span className="text-[10px] text-stone-500">({att.student.email})</span>
                            </label>
                          );
                        })
                      )}
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

          {monitoringData.length === 0 ? (
            <Card className="p-8 text-center text-stone-500 text-sm">
              No candidate attempts recorded for this exam yet.
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {monitoringData.map((att) => (
                <FacultyLiveMonitorCard
                  key={att.attempt_id}
                  monitoring={att}
                  mediaTracks={studentStreams[att.student.id]}
                />
              ))}
            </div>
          )}
        </div>

        {/* Proctoring Evidence & Identity Incident Review Gallery */}
        <div className="pt-6 border-t border-[#EBE5DC]">
          <FacultyEvidenceGallery examId={examId} examTitle={exam?.title} />
        </div>
      </div>
    </DashboardLayout>
  );
}
