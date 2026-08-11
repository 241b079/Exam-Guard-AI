'use client';

import React from 'react';
import { UserMenu } from '@/components/shared/UserMenu';

interface HeaderProps {
  title?: string;
}

export const Header: React.FC<HeaderProps> = ({ title = 'Dashboard' }) => {
  return (
    <header className="h-16 glass-panel border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-30">
      <h1 className="text-lg font-bold text-slate-100">{title}</h1>
      <UserMenu />
    </header>
  );
};
