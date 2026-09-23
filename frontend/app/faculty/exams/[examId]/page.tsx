'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FileText, Edit, HelpCircle, Upload, Send, Trash2, ArrowLeft, ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Exam, examService } from '@/features/exams';
import { attemptService, AttemptMonitoringResponse } from '@/features/attempts';
import { useWebRTCFaculty, FacultyLiveMonitorCard } from '@/features/proctoring';
import { Loading } from '@/components/shared/Loading';

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

  // WebRTC Live Monitoring for Students
  const { studentStreams, isWsConnected, refresh: refreshSignaling } = useWebRTCFaculty({ examId });


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

  useEffect(() => {
    if (examId) {
      fetchExam();
      fetchMonitoring();
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
        </div>

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
      </div>
    </DashboardLayout>
  );
}
