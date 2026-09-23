import { fetchApi } from '@/lib/api';
import {
  ExamAttempt,
  Answer,
  SaveAnswerPayload,
  SubmitAttemptResponse,
  ExamViolation,
  CreateViolationPayload,
  AttemptMonitoringResponse,
} from '../types';

export const attemptService = {
  async startOrResumeAttempt(examId: string): Promise<ExamAttempt> {
    return fetchApi<ExamAttempt>(`/api/v1/exams/${examId}/attempts`, {
      method: 'POST',
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
