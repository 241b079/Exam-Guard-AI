import { useState, useEffect, useCallback } from 'react';
import { Question } from '../types';
import { questionService } from '../services/questionService';

export function useQuestions(examId: string) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    if (!examId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await questionService.getQuestions(examId);
      setQuestions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setIsLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  return {
    questions,
    isLoading,
    error,
    refreshQuestions: fetchQuestions,
  };
}
