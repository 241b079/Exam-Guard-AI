import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'student' | 'faculty' | 'admin' | 'info' | 'success';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'info' }) => {
  const styles = {
    student: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    faculty: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    admin: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    info: 'bg-brand-500/10 text-brand-400 border-brand-500/30',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[variant]}`}>
      {children}
    </span>
  );
};
