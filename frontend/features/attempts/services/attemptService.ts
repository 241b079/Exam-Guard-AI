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
};
