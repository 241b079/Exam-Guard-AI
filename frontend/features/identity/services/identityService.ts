import { fetchApi } from '@/lib/api';
import { VerificationResponse, VerificationStatus } from '../types';

export const identityService = {
  async getVerificationStatus(examId: string): Promise<VerificationStatus> {
    return fetchApi<VerificationStatus>(`/api/v1/identity/status/${examId}`);
  },

  async verifyIdentity(examId: string, imageBlob: Blob): Promise<VerificationResponse> {
    const formData = new FormData();
    formData.append('exam_id', examId);
    formData.append('file', imageBlob, 'capture.jpg');

    return fetchApi<VerificationResponse>('/api/v1/identity/verify', {
      method: 'POST',
      body: formData,
    });
  },

  async uploadStudentPhoto(photoFile: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', photoFile);

    return fetchApi('/api/v1/students/me/photo', {
      method: 'POST',
      body: formData,
    });
  },
};
