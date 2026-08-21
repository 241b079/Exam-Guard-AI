import { fetchApi } from '@/lib/api';
import {
  LogProctoringEventPayload,
  ProctoringEvent,
  LiveExamProctoring,
  ProctoringOverviewItem,
} from '../types';

export const proctoringService = {
  async logEvent(payload: LogProctoringEventPayload): Promise<ProctoringEvent> {
    return fetchApi<ProctoringEvent>('/api/v1/proctoring/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getLiveExamFeed(examId: string): Promise<LiveExamProctoring> {
    return fetchApi<LiveExamProctoring>(`/api/v1/proctoring/exams/${examId}/live`);
  },

  async getAttemptTimeline(attemptId: string): Promise<ProctoringEvent[]> {
    return fetchApi<ProctoringEvent[]>(`/api/v1/proctoring/attempts/${attemptId}/events`);
  },

  async getOverview(): Promise<ProctoringOverviewItem[]> {
    return fetchApi<ProctoringOverviewItem[]>('/api/v1/proctoring/overview');
  },

  async terminateAttempt(attemptId: string, reason: string): Promise<void> {
    await fetchApi(`/api/v1/proctoring/attempts/${attemptId}/terminate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};
