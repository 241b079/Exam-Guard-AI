import { useState, useEffect, useCallback } from 'react';
import { Student } from '../types';
import { studentService } from '../services/studentService';

export function useStudents(initialSearch = '', initialDept = 'All', initialStatus = 'All') {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState(initialSearch);
  const [department, setDepartment] = useState(initialDept);
  const [status, setStatus] = useState(initialStatus);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await studentService.getStudents(search, department, status);
      setStudents(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load students');
    } finally {
      setIsLoading(false);
    }
  }, [search, department, status]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  return {
    students,
    search,
    setSearch,
    department,
    setDepartment,
    status,
    setStatus,
    isLoading,
    error,
    refreshStudents: fetchStudents,
  };
}
