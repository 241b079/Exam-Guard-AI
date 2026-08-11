import { fetchApi } from '@/lib/api';
import { User } from '@/types';
import { RegisterPayload, LoginPayload, AuthResponse } from '../types';

export const authService = {
  async register(payload: RegisterPayload): Promise<User> {
    return fetchApi<User>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const data = await fetchApi<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Cookies for Next.js middleware protection
      document.cookie = `user_role=${data.user.role}; path=/; max-age=604800; SameSite=Lax`;
      document.cookie = `auth_token=${data.access_token}; path=/; max-age=604800; SameSite=Lax`;
    }

    return data;
  },

  async getCurrentUser(): Promise<User> {
    return fetchApi<User>('/api/v1/auth/me');
  },

  async logout(): Promise<void> {
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
    if (refreshToken) {
      try {
        await fetchApi('/api/v1/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Ignore logout network errors
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      document.cookie = 'user_role=; path=/; max-age=0';
      document.cookie = 'auth_token=; path=/; max-age=0';
    }
  },
};
