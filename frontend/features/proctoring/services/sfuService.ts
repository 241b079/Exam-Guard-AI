import { fetchApi } from '@/lib/api';

export interface SFUTokenResponse {
  sfu_enabled: boolean;
  server_url: string;
  token: string;
  room_name: string;
  identity: string;
  role: string;
}

export const sfuService = {
  /**
   * Fetches an authorized LiveKit SFU access token for this exam room.
   */
  async getSfuToken(examId: string, attemptId?: string): Promise<SFUTokenResponse> {
    return fetchApi<SFUTokenResponse>('/api/v1/proctoring/sfu/token', {
      method: 'POST',
      body: JSON.stringify({
        exam_id: examId,
        attempt_id: attemptId,
      }),
    });
  },
};
