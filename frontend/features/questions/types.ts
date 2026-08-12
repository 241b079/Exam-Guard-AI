export type QuestionType = 'MCQ' | 'SHORT_ANSWER';

export interface Question {
  id: string;
  exam_id: string;
  question_type: QuestionType;
  question_text: string;
  options?: string[];
  correct_answer: string;
  marks: number;
  negative_marks: number;
  explanation?: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface CreateQuestionPayload {
  question_type: QuestionType;
  question_text: string;
  options?: string[];
  correct_answer: string;
  marks: number;
  negative_marks?: number;
  explanation?: string;
  order_index?: number;
}

export interface QuestionImportRow {
  row_number: number;
  question_type: string;
  question_text: string;
  options?: string[];
  correct_answer: string;
  marks: number;
  negative_marks: number;
  explanation?: string;
  is_valid: boolean;
  errors: string[];
}

export interface QuestionImportPreviewResponse {
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  rows: QuestionImportRow[];
}
