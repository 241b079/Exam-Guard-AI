export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';

export type ViolationType =
  | 'FULLSCREEN_EXIT'
  | 'CONTEXT_MENU'
  | 'COPY_ATTEMPT'
  | 'PASTE_ATTEMPT'
  | 'CUT_ATTEMPT'
  | 'PAGE_HIDDEN'
  | 'WINDOW_BLUR';

export interface Answer {
  id: string;
  question_id: string;
  selected_option?: string;
  answer_text?: string;
  is_marked_for_review: boolean;
  is_correct?: boolean;
  marks_awarded?: number;
  created_at: string;
  updated_at: string;
}

export interface ExamViolation {
  id: string;
  exam_attempt_id: string;
  student_id: string;
  violation_type: ViolationType;
  timestamp: string;
  metadata_json?: Record<string, any>;
  created_at: string;
}

export interface CreateViolationPayload {
  violation_type: ViolationType;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  started_at: string;
  submitted_at?: string;
  status: AttemptStatus;
  total_score?: number;
  max_possible_score?: number;
  identity_verified?: boolean;
  identity_verified_at?: string;
  identity_verification_score?: number;
  answers: Answer[];
  time_remaining_seconds: number;
  violation_count?: number;
}

export interface SaveAnswerPayload {
  question_id: string;
  selected_option?: string;
  answer_text?: string;
  is_marked_for_review: boolean;
}

export interface SubmitAttemptResponse {
  attempt_id: string;
  exam_id: string;
  exam_title: string;
  status: AttemptStatus;
  started_at: string;
  submitted_at: string;
  total_questions: number;
  attempted_questions: number;
  correct_mcq_count: number;
  total_score: number;
  max_possible_score: number;
  short_answer_status: string;
}

export interface AttemptMonitoringStudentInfo {
  id: string;
  name: string;
  email: string;
  roll_number?: string;
}

export interface AttemptMonitoringResponse {
  attempt_id: string;
  exam_id: string;
  student: AttemptMonitoringStudentInfo;
  status: AttemptStatus;
  started_at: string;
  submitted_at?: string;
  violation_count: number;
  recent_violations: ExamViolation[];
}
