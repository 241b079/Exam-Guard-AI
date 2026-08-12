import { fetchApi } from '@/lib/api';
import {
  Question,
  CreateQuestionPayload,
  QuestionImportRow,
  QuestionImportPreviewResponse
} from '../types';

export const questionService = {
  async getQuestions(examId: string): Promise<Question[]> {
    return fetchApi<Question[]>(`/api/v1/exams/${examId}/questions`);
  },

  async createQuestion(examId: string, payload: CreateQuestionPayload): Promise<Question> {
    return fetchApi<Question>(`/api/v1/exams/${examId}/questions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateQuestion(questionId: string, payload: Partial<CreateQuestionPayload>): Promise<Question> {
    return fetchApi<Question>(`/api/v1/questions/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteQuestion(questionId: string): Promise<void> {
    await fetchApi(`/api/v1/questions/${questionId}`, {
      method: 'DELETE',
    });
  },

  async previewImport(examId: string, file: File): Promise<QuestionImportPreviewResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

    const response = await fetch(`${API_URL}/api/v1/exams/${examId}/questions/import/preview`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to parse import file' }));
      throw new Error(err.detail || 'File parsing failed');
    }

    return response.json();
  },

  async commitImport(examId: string, rows: QuestionImportRow[]): Promise<Question[]> {
    return fetchApi<Question[]>(`/api/v1/exams/${examId}/questions/import`, {
      method: 'POST',
      body: JSON.stringify(rows),
    });
  },
};
