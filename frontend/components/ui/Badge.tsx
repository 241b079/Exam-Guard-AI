import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'student' | 'faculty' | 'admin' | 'info' | 'success' | 'danger';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'info' }) => {
  const styles = {
    student: 'bg-[#DEF7EC] text-[#03543F] border-[#BCF0DA]',
    faculty: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
    admin: 'bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]',
    info: 'bg-[#FBECE0] text-[#C25E1A] border-[#F6D6C0]',
    success: 'bg-[#DEF7EC] text-[#03543F] border-[#BCF0DA]',
    danger: 'bg-[#FDE8E8] text-[#9B1C1C] border-[#F8B4B4]',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[variant]}`}>
      {children}
    </span>
  );
};

