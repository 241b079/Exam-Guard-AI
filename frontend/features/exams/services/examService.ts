import { fetchApi } from '@/lib/api';
import { Exam, CreateExamPayload, UpdateExamPayload } from '../types';

export const examService = {
  async getExams(): Promise<Exam[]> {
    return fetchApi<Exam[]>('/api/v1/exams');
  },

  async getExamById(id: string): Promise<Exam> {
    return fetchApi<Exam>(`/api/v1/exams/${id}`);
  },

  async createExam(payload: CreateExamPayload): Promise<Exam> {
    return fetchApi<Exam>('/api/v1/exams', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateExam(id: string, payload: UpdateExamPayload): Promise<Exam> {
    return fetchApi<Exam>(`/api/v1/exams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteExam(id: string): Promise<void> {
    await fetchApi(`/api/v1/exams/${id}`, {
      method: 'DELETE',
    });
  },

  async publishExam(id: string): Promise<Exam> {
    return fetchApi<Exam>(`/api/v1/exams/${id}/publish`, {
      method: 'POST',
    });
  },
};
