import { fetchApi, getApiUrl } from '@/lib/api';

export type ContinuousMonitoringState =
  | 'NORMAL_VERIFIED'
  | 'TEMPORARILY_ABSENT'
  | 'IDENTITY_MISMATCH'
  | 'MULTIPLE_PERSON'
  | 'MULTIPLE_PERSON_IDENTITY_MISMATCH'
  | 'RECOVERED';

export type ReviewStatus = 'PENDING' | 'CONFIRMED' | 'DISMISSED' | 'FALSE_POSITIVE';

export interface ContinuousVerificationResult {
  state: ContinuousMonitoringState;
  is_suspicious: boolean;
  face_count: number;
  similarity?: number | null;
  confidence?: number | null;
  message: string;
  incident_id?: string | null;
  event_created: boolean;
  event_id?: string | null;
  evidence_captured: boolean;
}

export interface ProctoringEventItem {
  id: string;
  exam_id: string;
  exam_attempt_id?: string | null;
  student_id: string;
  student_name?: string | null;
  student_email?: string | null;
  student_roll_number?: string | null;
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  review_status: ReviewStatus;
  review_comment?: string | null;
  reviewed_by_id?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  detected_at: string;
  started_at: string;
  ended_at?: string | null;
  duration: number;
  confidence?: number | null;
  face_count: number;
  expected_identity?: string | null;
  detected_identity_status?: string | null;
  evidence_url?: string | null;
  incident_id?: string | null;
  metadata_json?: Record<string, any> | null;
  created_at: string;
}

export interface ProctoringEventsListResponse {
  total: number;
  events: ProctoringEventItem[];
}

export const continuousProctoringService = {
  /**
   * Submits a sampled camera frame for continuous live identity verification
   */
  async verifyContinuousFrame(examId: string, imageBlob: Blob): Promise<ContinuousVerificationResult> {
    const formData = new FormData();
    formData.append('exam_id', examId);
    formData.append('file', imageBlob, 'frame.jpg');

    return fetchApi<ContinuousVerificationResult>('/api/v1/proctoring/continuous-verify', {
      method: 'POST',
      body: formData,
    });
  },

  /**
   * Retrieves list of suspicious proctoring events for an exam
   */
  async listProctoringEvents(
    examId: string,
    params?: {
      studentId?: string;
      reviewStatus?: string;
      eventType?: string;
      skip?: number;
      limit?: number;
    }
  ): Promise<ProctoringEventsListResponse> {
    const query = new URLSearchParams();
    if (params?.studentId) query.append('student_id', params.studentId);
    if (params?.reviewStatus) query.append('review_status', params.reviewStatus);
    if (params?.eventType) query.append('event_type', params.eventType);
    if (params?.skip !== undefined) query.append('skip', String(params.skip));
    if (params?.limit !== undefined) query.append('limit', String(params.limit));

    const qs = query.toString();
    const endpoint = `/api/v1/proctoring/events/${examId}${qs ? `?${qs}` : ''}`;
    return fetchApi<ProctoringEventsListResponse>(endpoint);
  },

  /**
   * Reviews a suspicious event: Confirmed misconduct, Dismissed, or False Positive
   */
  async reviewEvent(
    eventId: string,
    reviewStatus: ReviewStatus,
    comment?: string
  ): Promise<ProctoringEventItem> {
    return fetchApi<ProctoringEventItem>(`/api/v1/proctoring/events/${eventId}/review`, {
      method: 'PATCH',
      body: JSON.stringify({
        review_status: reviewStatus,
        review_comment: comment || null,
      }),
    });
  },

  /**
   * Constructs the absolute/authenticated URL for an evidence image
   */
  getEvidenceImageUrl(eventId: string): string {
    const apiUrl = getApiUrl();
    return `${apiUrl}/api/v1/proctoring/evidence/${eventId}`;
  },
};
