export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type NegativeMarkingType = 'NONE' | 'PER_QUESTION';
export type AssignmentType = 'ALL_STUDENTS' | 'SELECTED_STUDENTS';
export type AvailabilityType = 'ALWAYS' | 'SCHEDULED';

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
  enable_proctoring: boolean;
  assignment_type: AssignmentType;
  assigned_student_ids?: string[];
  availability_type: AvailabilityType;
  start_time?: string;
  end_time?: string;
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
  enable_proctoring: boolean;
  assignment_type: AssignmentType;
  assigned_student_ids?: string[];
  availability_type: AvailabilityType;
  start_time?: string;
  end_time?: string;
}

export type UpdateExamPayload = Partial<CreateExamPayload> & {
  status?: ExamStatus;
};

