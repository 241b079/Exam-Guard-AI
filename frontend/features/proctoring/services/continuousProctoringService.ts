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
  exam_title?: string | null;
  exam_attempt_id?: string | null;
  attempt_number?: number | null;
  attempt_started_at?: string | null;
  attempt_submitted_at?: string | null;
  attempt_status?: string | null;
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

export interface StudentRiskScoreResponse {
  id: string;
  exam_id: string;
  exam_attempt_id: string;
  student_id: string;
  current_score: number;
  peak_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  incident_count: number;
  confirmed_incidents_count: number;
  suspicious_incidents_count: number;
  inconclusive_incidents_count: number;
  monitoring_status: string;
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

export interface FacultyAlertResponse {
  id: string;
  exam_id: string;
  exam_attempt_id: string;
  student_id: string;
  student_name?: string | null;
  student_email?: string | null;
  current_risk_score: number;
  risk_classification: string;
  severity: string;
  title: string;
  description: string;
  evidence_url?: string | null;
  trigger_event_type: string;
  ai_explanation?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface IncidentTimelineItem {
  incident_id: string;
  incident_type: string;
  category: string;
  severity: string;
  started_at: string;
  ended_at?: string | null;
  duration_seconds: number;
  confidence: number;
  ai_classification: string;
  ai_explanation?: string | null;
  evidence_url?: string | null;
  evidence_reference?: string | null;
  review_status: string;
  risk_contribution: number;
}

export interface ExaminationInvestigationResponse {
  id: string;
  exam_id: string;
  exam_title?: string | null;
  exam_attempt_id: string;
  student_id: string;
  student_name?: string | null;
  student_email?: string | null;
  student_roll_number?: string | null;
  final_risk_score: number;
  peak_risk_score: number;
  risk_classification: string;
  total_incidents: number;
  confirmed_incidents_count: number;
  suspicious_incidents_count: number;
  inconclusive_incidents_count: number;
  review_priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  investigation_status:
    | 'PENDING_REVIEW'
    | 'UNDER_INVESTIGATION'
    | 'CLEARED'
    | 'VIOLATION_CONFIRMED'
    | 'DISQUALIFIED'
    | 'INCONCLUSIVE';
  executive_summary: string;
  incident_timeline_json: IncidentTimelineItem[];
  score_history_json: Array<{
    score_before: number;
    score_after: number;
    delta: number;
    trigger: string;
    timestamp: string;
    reason?: string;
  }>;
  correlations_json: string[];
  limitations_json: string[];
  recommended_action: string;
  faculty_decision?: string | null;
  decision_reason?: string | null;
  decision_notes?: string | null;
  decided_at?: string | null;
  decided_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export const continuousProctoringService = {
  /**
   * Submits a sampled camera frame for continuous live identity verification
   */
  async verifyContinuousFrame(
    examId: string,
    imageBlob: Blob,
    attemptId?: string | null
  ): Promise<ContinuousVerificationResult> {
    const formData = new FormData();
    formData.append('exam_id', examId);
    if (attemptId) {
      formData.append('attempt_id', attemptId);
    }
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
      attemptId?: string;
      studentId?: string;
      reviewStatus?: string;
      eventType?: string;
      skip?: number;
      limit?: number;
    }
  ): Promise<ProctoringEventsListResponse> {
    const query = new URLSearchParams();
    if (params?.attemptId) query.append('attempt_id', params.attemptId);
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    return token
      ? `${apiUrl}/api/v1/proctoring/evidence/${eventId}?token=${encodeURIComponent(token)}`
      : `${apiUrl}/api/v1/proctoring/evidence/${eventId}`;
  },

  /**
   * Retrieves current dynamic risk score and history for an attempt
   */
  async getAttemptRiskScore(attemptId: string): Promise<StudentRiskScoreResponse> {
    return fetchApi<StudentRiskScoreResponse>(`/api/v1/proctoring/risk/${attemptId}`);
  },

  /**
   * Lists real-time faculty alerts for an exam
   */
  async listFacultyAlerts(examId: string): Promise<FacultyAlertResponse[]> {
    return fetchApi<FacultyAlertResponse[]>(`/api/v1/proctoring/alerts/${examId}`);
  },

  /**
   * Marks a faculty alert as acknowledged/read
   */
  async markAlertRead(alertId: string): Promise<{ success: boolean }> {
    return fetchApi<{ success: boolean }>(`/api/v1/proctoring/alerts/${alertId}/read`, {
      method: 'PATCH',
    });
  },

  /**
   * Lists all post-examination investigations for an exam
   */
  async listInvestigations(examId: string): Promise<ExaminationInvestigationResponse[]> {
    return fetchApi<ExaminationInvestigationResponse[]>(`/api/v1/proctoring/investigations/${examId}`);
  },

  /**
   * Retrieves the comprehensive post-examination investigation dossier for an attempt
   */
  async getInvestigation(examId: string, attemptId: string): Promise<ExaminationInvestigationResponse> {
    return fetchApi<ExaminationInvestigationResponse>(`/api/v1/proctoring/investigations/${examId}/attempt/${attemptId}`);
  },

  /**
   * Submits a formal faculty investigation decision (CLEARED, VIOLATION_CONFIRMED, DISQUALIFIED)
   */
  async submitDecision(
    attemptId: string,
    payload: { decision: string; reason?: string; notes?: string }
  ): Promise<ExaminationInvestigationResponse> {
    return fetchApi<ExaminationInvestigationResponse>(`/api/v1/proctoring/investigations/${attemptId}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Reviews an individual incident (CONFIRMED, FALSE_POSITIVE) with automatic risk recalculation
   */
  async reviewIncident(
    attemptId: string,
    incidentId: string,
    payload: { status: 'CONFIRMED' | 'FALSE_POSITIVE' | 'PENDING'; comment?: string }
  ): Promise<{ success: boolean; incident_id: string; review_status: string; new_risk_score: number; new_risk_level: string }> {
    return fetchApi(`/api/v1/proctoring/investigations/${attemptId}/incident/${incidentId}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
