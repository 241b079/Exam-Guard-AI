import { fetchApi } from '@/lib/api';
import {
  Student,
  CreateStudentPayload,
  UpdateStudentPayload,
  StudentImportRow,
  StudentImportPreviewResponse
} from '../types';

export const studentService = {
  async getStudents(search?: string, department?: string, status?: string): Promise<Student[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (department) params.append('department', department);
    if (status) params.append('status', status);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    return fetchApi<Student[]>(`/api/v1/students${queryString}`);
  },

  async getStudentById(id: string): Promise<Student> {
    return fetchApi<Student>(`/api/v1/students/${id}`);
  },

  async createStudent(payload: CreateStudentPayload): Promise<Student> {
    return fetchApi<Student>('/api/v1/students', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateStudent(id: string, payload: UpdateStudentPayload): Promise<Student> {
    return fetchApi<Student>(`/api/v1/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async patchStatus(id: string, is_active: boolean): Promise<Student> {
    return fetchApi<Student>(`/api/v1/students/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active }),
    });
  },

  async previewImport(file: File): Promise<StudentImportPreviewResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

    const response = await fetch(`${API_URL}/api/v1/students/import/preview`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Failed to parse student import file' }));
      throw new Error(err.detail || 'File parsing failed');
    }

    return response.json();
  },

  async commitImport(rows: StudentImportRow[]): Promise<Student[]> {
    return fetchApi<Student[]>('/api/v1/students/import', {
      method: 'POST',
      body: JSON.stringify(rows),
    });
  },
};
