import { fetchApi } from '@/lib/api';
import { User } from '@/types';

export const userService = {
  async getMyProfile(): Promise<User> {
    return fetchApi<User>('/api/v1/users/me');
  },
};
