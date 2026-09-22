export type UserRole = 'STUDENT' | 'FACULTY' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiError {
  detail: string | { msg: string }[];
}

export type PermissionStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

export interface ProfileEditPermission {
  id: string;
  student_profile_id: string;
  granted_by_id: string;
  granted_by_name: string;
  allowed_fields: string[];
  status: PermissionStatus;
  granted_at: string;
  expires_at?: string | null;
  used_at?: string | null;
  notes?: string | null;
}

export interface StudentProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  student_id: string;
  batch?: string | null;
  phone?: string | null;
  department?: string | null;
  course?: string | null;
  semester?: number | null;
  section?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  profile_picture_url?: string | null;
  profile_completed: boolean;
  active_permission?: ProfileEditPermission | null;
  created_at: string;
  updated_at: string;
}

export interface FacultyProfile {
  id: string;
  user_id: string;
  faculty_id: string;
  name: string;
  email: string;
  phone?: string | null;
  department?: string | null;
  designation?: string | null;
  assigned_batches: string[];
  profile_picture_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchSummary {
  batch: string;
  student_count: number;
  completed_count: number;
  locked_count: number;
  active_permission_count: number;
}
