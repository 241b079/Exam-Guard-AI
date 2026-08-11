import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'glass' | 'solid';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'glass',
  className = '',
  ...props
}) => {
  const styles = variant === 'glass' ? 'glass-card' : 'bg-slate-800 border border-slate-700';

  return (
    <div className={`${styles} rounded-xl p-6 shadow-xl ${className}`} {...props}>
      {children}
    </div>
  );
};
