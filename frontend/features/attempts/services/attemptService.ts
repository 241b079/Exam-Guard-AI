import { fetchApi } from '@/lib/api';
import {
  ExamAttempt,
  Answer,
  SaveAnswerPayload,
  SubmitAttemptResponse
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
};
