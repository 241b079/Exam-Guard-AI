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
  const styles = variant === 'glass' ? 'glass-card' : 'bg-white border border-[#EBE5DC]';

  return (
    <div className={`${styles} rounded-2xl p-6 shadow-warm ${className}`} {...props}>
      {children}
    </div>
  );
};

