import { useState, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { authService } from '../services/authService';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        setUser(null);
      }
    }

    // Verify token & sync user with backend
    authService.getCurrentUser()
      .then((fetchedUser) => {
        setUser(fetchedUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(fetchedUser));
          document.cookie = `user_role=${fetchedUser.role}; path=/; max-age=604800; SameSite=Lax`;
        }
      })
      .catch((err) => {
        const msg = String(err?.message || '');
        if (msg.includes('401') || msg.includes('403') || msg.includes('token') || msg.includes('Unauthorized')) {
          setUser(null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem('user');
            localStorage.removeItem('access_token');
            document.cookie = 'user_role=; path=/; max-age=0';
            document.cookie = 'auth_token=; path=/; max-age=0';
          }
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const logout = async () => {
    await authService.logout();
    setUser(null);
    window.location.href = '/login';
  };

  const getDashboardPath = (role?: UserRole): string => {
    const targetRole = role || user?.role;
    switch (targetRole) {
      case 'STUDENT':
        return '/student/dashboard';
      case 'FACULTY':
        return '/faculty/dashboard';
      case 'ADMIN':
        return '/admin/dashboard';
      default:
        return '/login';
    }
  };

  return {
    user,
    isLoading,
    logout,
    getDashboardPath,
  };
}
