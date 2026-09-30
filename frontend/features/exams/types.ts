export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type NegativeMarkingType = 'NONE' | 'PER_QUESTION';
export type AssignmentType = 'ALL_STUDENTS' | 'SELECTED_STUDENTS';
export type AvailabilityType = 'ALWAYS' | 'SCHEDULED';
export type AttemptPolicyType = 'ONE_ATTEMPT' | 'LIMITED_ATTEMPTS' | 'UNLIMITED_ATTEMPTS';

export interface Exam {
  id: string;
  title: string;
  description?: string;
  duration_minutes: number;
  total_marks: number;
  status: ExamStatus;
  negative_marking: NegativeMarkingType;
  auto_submit: boolean;
  display_countdown: boolean;
  assignment_type: AssignmentType;
  assigned_student_ids?: string[];
  availability_type: AvailabilityType;
  start_time?: string;
  end_time?: string;
  attempt_policy?: AttemptPolicyType;
  max_attempts?: number;
  max_rejoins?: number;
  created_by_id: string;
  question_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateExamPayload {
  title: string;
  description?: string;
  duration_minutes: number;
  negative_marking: NegativeMarkingType;
  auto_submit: boolean;
  display_countdown: boolean;
  assignment_type: AssignmentType;
  assigned_student_ids?: string[];
  availability_type: AvailabilityType;
  start_time?: string;
  end_time?: string;
  attempt_policy?: AttemptPolicyType;
  max_attempts?: number;
  max_rejoins?: number;
}

export type UpdateExamPayload = Partial<CreateExamPayload> & {
  status?: ExamStatus;
};

export interface GrantReexamPayload {
  scope: 'SELECTED' | 'ALL';
  student_ids?: string[];
  extra_attempts?: number;
}

export interface ReexamPermissionResponse {
  id: string;
  exam_id: string;
  student_id?: string;
  student_name?: string;
  student_email?: string;
  student_roll_number?: string;
  extra_attempts_allowed: number;
  attempts_consumed: number;
  remaining_attempts: number;
  created_at: string;
}
