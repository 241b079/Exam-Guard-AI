import { fetchApi } from '@/lib/api';
import {
  ExamAttempt,
  Answer,
  SaveAnswerPayload,
  SubmitAttemptResponse,
  ExamViolation,
  CreateViolationPayload,
  AttemptMonitoringResponse,
  MediaSessionResponse,
  UpdateMediaStatusRequest,
  StartOrResumeAttemptRequest,
  StudentActiveExamSummary,
  StudentExamStatusResponse,
  AttemptReviewResponse,
  StudentCompletedResultItem,
  ExamGradebookResponse,
  GradebookEntry,
  ManualGradeRequest,
  ManualGradeResponse,
} from '../types';

export const attemptService = {
  async getStudentActiveExam(): Promise<StudentActiveExamSummary | null> {
    return fetchApi<StudentActiveExamSummary | null>('/api/v1/student/active-exam');
  },

  async getStudentExamStatus(examId: string): Promise<StudentExamStatusResponse> {
    return fetchApi<StudentExamStatusResponse>(`/api/v1/exams/${examId}/student-status`);
  },

  async startOrResumeAttempt(examId: string, payload?: StartOrResumeAttemptRequest): Promise<ExamAttempt> {
    return fetchApi<ExamAttempt>(`/api/v1/exams/${examId}/attempts`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    });
  },

  async rejoinAttempt(attemptId: string, payload?: StartOrResumeAttemptRequest): Promise<ExamAttempt> {
    return fetchApi<ExamAttempt>(`/api/v1/attempts/${attemptId}/rejoin`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    });
  },

  async getOrCreateMediaSession(attemptId: string): Promise<MediaSessionResponse> {
    return fetchApi<MediaSessionResponse>(`/api/v1/attempts/${attemptId}/media-session`, {
      method: 'POST',
    });
  },

  async updateMediaSession(attemptId: string, payload: UpdateMediaStatusRequest): Promise<MediaSessionResponse> {
    return fetchApi<MediaSessionResponse>(`/api/v1/attempts/${attemptId}/media-session`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async getAttempt(attemptId: string): Promise<ExamAttempt> {
    return fetchApi<ExamAttempt>(`/api/v1/attempts/${attemptId}`);
  },

  async saveAnswer(attemptId: string, payload: SaveAnswerPayload): Promise<Answer> {
    return fetchApi<Answer>(`/api/v1/attempts/${attemptId}/answers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async submitAttempt(attemptId: string): Promise<SubmitAttemptResponse> {
    return fetchApi<SubmitAttemptResponse>(`/api/v1/attempts/${attemptId}/submit`, {
      method: 'POST',
    });
  },

  async recordViolation(attemptId: string, payload: CreateViolationPayload): Promise<ExamViolation> {
    return fetchApi<ExamViolation>(`/api/v1/attempts/${attemptId}/violations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getViolations(attemptId: string): Promise<ExamViolation[]> {
    return fetchApi<ExamViolation[]>(`/api/v1/attempts/${attemptId}/violations`);
  },

  async getExamAttemptsMonitoring(examId: string): Promise<AttemptMonitoringResponse[]> {
    return fetchApi<AttemptMonitoringResponse[]>(`/api/v1/exams/${examId}/attempts-monitoring`);
  },

  async getMyExamResult(examId: string, attemptId?: string): Promise<AttemptReviewResponse> {
    const url = attemptId
      ? `/api/v1/exams/${examId}/my-result?attempt_id=${encodeURIComponent(attemptId)}`
      : `/api/v1/exams/${examId}/my-result`;
    return fetchApi<AttemptReviewResponse>(url);
  },

  async getStudentResults(): Promise<StudentCompletedResultItem[]> {
    return fetchApi<StudentCompletedResultItem[]>('/api/v1/student/results');
  },

  async getExamGradebook(examId: string): Promise<ExamGradebookResponse> {
    return fetchApi<ExamGradebookResponse>(`/api/v1/exams/${examId}/gradebook`);
  },

  async getFacultyRecentResults(limit: number = 15): Promise<GradebookEntry[]> {
    return fetchApi<GradebookEntry[]>(`/api/v1/faculty/results/recent?limit=${limit}`);
  },

  async getAttemptReview(attemptId: string): Promise<AttemptReviewResponse> {
    return fetchApi<AttemptReviewResponse>(`/api/v1/attempts/${attemptId}/review`);
  },

  async gradeShortAnswer(
    attemptId: string,
    answerId: string,
    payload: ManualGradeRequest
  ): Promise<ManualGradeResponse> {
    return fetchApi<ManualGradeResponse>(`/api/v1/attempts/${attemptId}/answers/${answerId}/grade`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};

