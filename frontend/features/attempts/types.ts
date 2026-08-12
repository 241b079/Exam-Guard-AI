export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';

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

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  started_at: string;
  submitted_at?: string;
  status: AttemptStatus;
  total_score?: number;
  max_possible_score?: number;
  answers: Answer[];
  time_remaining_seconds: number;
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
