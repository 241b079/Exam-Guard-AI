export interface Student {
  id: string; // StudentProfile ID
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  student_id: string; // Roll number / Student ID
  phone?: string;
  department?: string;
  course?: string;
  semester?: number;
  section?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateStudentPayload {
  name: string;
  email: string;
  student_id: string;
  password?: string;
  phone?: string;
  department?: string;
  course?: string;
  semester?: number;
  section?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
}

export interface UpdateStudentPayload {
  name?: string;
  email?: string;
  phone?: string;
  department?: string;
  course?: string;
  semester?: number;
  section?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
}

export interface StudentImportRow {
  row_number: number;
  name: string;
  email: string;
  student_id: string;
  phone?: string;
  department?: string;
  course?: string;
  semester?: number;
  section?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  is_valid: boolean;
  errors: string[];
}

export interface StudentImportPreviewResponse {
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  rows: StudentImportRow[];
}
