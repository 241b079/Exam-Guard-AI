export interface VerificationResponse {
  verified: boolean;
  message: string;
  similarity: number;
  attempt_id?: string;
}

export interface VerificationStatus {
  exam_id: string;
  is_verified: boolean;
  verified_at?: string;
  similarity?: number;
  student_name: string;
  student_id: string;
  profile_picture_url?: string;
}
