export type ProctoringEventType =
  | 'TAB_SWITCH'
  | 'FULLSCREEN_EXIT'
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'CAMERA_OFF'
  | 'MIC_OFF'
  | 'DEVTOOLS_OPENED'
  | 'DISCONNECTED'
  | 'VOICE_DETECTED'
  | 'SUSPICIOUS_KEYPRESS';

export type ProctoringSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface LogProctoringEventPayload {
  attempt_id: string;
  event_type: ProctoringEventType;
  severity: ProctoringSeverity;
  details?: Record<string, any>;
  snapshot_url?: string;
}

export interface ProctoringEvent {
  id: string;
  attempt_id: string;
  exam_id: string;
  student_id: string;
  event_type: ProctoringEventType;
  severity: ProctoringSeverity;
  details?: Record<string, any>;
  snapshot_url?: string;
  timestamp: string;
}

export interface LiveCandidate {
  attempt_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  student_roll_no?: string;
  status: string;
  started_at: string;
  submitted_at?: string;
  trust_score: number; // 0 - 100
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  tab_switch_count: number;
  fullscreen_exit_count: number;
  camera_off_count: number;
  total_violations: number;
  latest_event?: ProctoringEvent;
  is_live: boolean;
  last_seen?: string;
}

export interface LiveExamProctoring {
  exam_id: string;
  exam_title: string;
  duration_minutes: number;
  enable_proctoring: boolean;
  total_candidates: number;
  active_candidates_count: number;
  flagged_candidates_count: number;
  candidates: LiveCandidate[];
}

export interface ProctoringOverviewItem {
  exam_id: string;
  exam_title: string;
  status: string;
  enable_proctoring: boolean;
  total_attempts: number;
  active_attempts: number;
  flagged_attempts: number;
}

