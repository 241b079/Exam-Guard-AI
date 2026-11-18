import { fetchApi } from '@/lib/api';
import {
  AdminUser,
  CreateAdminUserPayload,
  UpdateAdminUserPayload,
  AdminTelemetry,
  AdminSettings,
  GlobalExamItem,
} from '../types';
import { UserRole } from '@/types';

export const adminService = {
  // Telemetry & Health
  async getTelemetry(): Promise<AdminTelemetry> {
    return fetchApi<AdminTelemetry>('/api/v1/admin/telemetry');
  },

  // Dynamic Settings
  async getSettings(): Promise<AdminSettings> {
    return fetchApi<AdminSettings>('/api/v1/admin/settings');
  },

  async updateSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> {
    return fetchApi<AdminSettings>('/api/v1/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },

  // Users Management
  async listUsers(role?: string, isActive?: boolean): Promise<AdminUser[]> {
    let query = '';
    const params = new URLSearchParams();
    if (role && role !== 'ALL') params.append('role', role);
    if (isActive !== undefined) params.append('is_active', String(isActive));
    if (params.toString()) query = `?${params.toString()}`;
    return fetchApi<AdminUser[]>(`/api/v1/users${query}`);
  },

  async createUser(payload: CreateAdminUserPayload): Promise<AdminUser> {
    return fetchApi<AdminUser>('/api/v1/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateUser(userId: string, payload: UpdateAdminUserPayload): Promise<AdminUser> {
    return fetchApi<AdminUser>(`/api/v1/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async updateUserRole(userId: string, role: UserRole): Promise<AdminUser> {
    return fetchApi<AdminUser>(`/api/v1/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  async updateUserStatus(userId: string, isActive: boolean): Promise<AdminUser> {
    return fetchApi<AdminUser>(`/api/v1/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    });
  },

  async deleteUser(userId: string): Promise<void> {
    return fetchApi<void>(`/api/v1/users/${userId}`, {
      method: 'DELETE',
    });
  },

  // Global Exam Catalog
  async listGlobalExams(): Promise<GlobalExamItem[]> {
    return fetchApi<GlobalExamItem[]>('/api/v1/exams/admin/catalog');
  },

  async publishExam(examId: string): Promise<any> {
    return fetchApi<any>(`/api/v1/exams/${examId}/publish`, {
      method: 'POST',
    });
  },

  async unpublishExam(examId: string): Promise<any> {
    return fetchApi<any>(`/api/v1/exams/${examId}/unpublish`, {
      method: 'POST',
    });
  },

  async deleteExam(examId: string): Promise<void> {
    return fetchApi<void>(`/api/v1/exams/${examId}`, {
      method: 'DELETE',
    });
  },
};
