'use client';

import React from 'react';
import { UserMenu } from '@/components/shared/UserMenu';

interface HeaderProps {
  title?: string;
}

export const Header: React.FC<HeaderProps> = ({ title = 'Dashboard' }) => {
  return (
    <header className="h-16 glass-panel border-b border-[#EBE5DC] px-6 flex items-center justify-between sticky top-0 z-30 bg-white/90">
      <h1 className="text-xl font-bold font-serif text-stone-900 tracking-tight">{title}</h1>
      <UserMenu />
    </header>
  );
};

