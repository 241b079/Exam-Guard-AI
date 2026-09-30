export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';

export type ViolationType =
  | 'FULLSCREEN_EXIT'
  | 'CONTEXT_MENU'
  | 'COPY_ATTEMPT'
  | 'PASTE_ATTEMPT'
  | 'CUT_ATTEMPT'
  | 'PAGE_HIDDEN'
  | 'WINDOW_BLUR'
  | 'CAMERA_PERMISSION_DENIED'
  | 'MICROPHONE_PERMISSION_DENIED'
  | 'SCREEN_SHARE_DENIED'
  | 'CAMERA_STOPPED'
  | 'MICROPHONE_STOPPED'
  | 'SCREEN_SHARE_STOPPED'
  | 'MEDIA_CONNECTION_LOST'
  | 'MEDIA_CONNECTION_FAILED';

export type MediaSessionStatus =
  | 'WAITING'
  | 'REQUESTING_MEDIA'
  | 'MEDIA_READY'
  | 'SCREEN_SHARE_READY'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ENDED';

export interface MediaSessionResponse {
  id: string;
  exam_attempt_id: string;
  student_id: string;
  status: MediaSessionStatus;
  camera_active: boolean;
  mic_active: boolean;
  screen_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateMediaStatusRequest {
  status?: MediaSessionStatus;
  camera_active?: boolean;
  mic_active?: boolean;
  screen_active?: boolean;
}

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
  attempt_number?: number;
  started_at: string;
  deadline?: string;
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
  rejoin_count?: number;
  max_rejoins?: number;
  session_token?: string;
}

export interface StartOrResumeAttemptRequest {
  session_token?: string;
  is_rejoin?: boolean;
}

export interface StudentActiveExamSummary {
  exam_id: string;
  exam_title: string;
  attempt_id: string;
  attempt_number: number;
  status: AttemptStatus;
  time_remaining_seconds: number;
  deadline?: string;
  rejoin_count: number;
  max_rejoins: number;
  identity_verified: boolean;
}

export interface StudentExamStatusResponse {
  exam_id: string;
  has_active_attempt: boolean;
  active_attempt_id?: string;
  latest_attempt_status?: string;
  latest_attempt_number: number;
  reexam_available: boolean;
  can_start_or_resume: boolean;
  time_remaining_seconds: number;
  rejoin_count: number;
  max_rejoins: number;
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
  attempt_number?: number;
  status: AttemptStatus;
  started_at: string;
  submitted_at?: string;
  violation_count: number;
  recent_violations: ExamViolation[];
  media_session?: MediaSessionResponse | null;
  rejoin_count?: number;
  max_rejoins?: number;
}
