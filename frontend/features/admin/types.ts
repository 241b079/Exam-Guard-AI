import { UserRole } from '@/types';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAdminUserPayload {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
}

export interface UpdateAdminUserPayload {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface AdminTelemetry {
  users: {
    total: number;
    students: number;
    faculty: number;
    admins: number;
    active: number;
    inactive: number;
  };
  exams: {
    total: number;
    draft: number;
    published: number;
    closed: number;
  };
  attempts: {
    total: number;
    in_progress: number;
    submitted: number;
    graded: number;
  };
  violations: {
    total: number;
    by_type: Record<string, number>;
  };
  proctoring: {
    total_events: number;
    pending_review: number;
    confirmed: number;
    dismissed: number;
    false_positives: number;
  };
  connections: {
    active_candidate_sessions: number;
  };
  system_health: {
    postgres: string;
    postgres_latency_ms: number;
    redis: string;
    server_time: string;
    app_env: string;
  };
  recent_activity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
  }>;
}

export interface AdminSettings {
  face_match_threshold: number;
  multiple_person_grace_sec: number;
  looking_away_threshold_sec: number;
  object_detection_enabled: boolean;
  audio_anomaly_detection_enabled: boolean;
  strict_lockdown_enabled: boolean;
  max_rejoins_allowed: number;
  system_announcement?: string;
}

export interface GlobalExamItem {
  id: string;
  title: string;
  description?: string;
  duration_minutes: number;
  total_marks: number;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  created_by_id: string;
  creator_name: string;
  creator_email: string;
  question_count: number;
  attempts_count: number;
  assignment_type: string;
  created_at: string;
  updated_at: string;
}
