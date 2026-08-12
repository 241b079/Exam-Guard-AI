import { useState, useEffect, useCallback } from 'react';
import { Exam } from '../types';
import { examService } from '../services/examService';

export function useExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExams = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await examService.getExams();
      setExams(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load exams');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  return {
    exams,
    isLoading,
    error,
    refreshExams: fetchExams,
  };
}
