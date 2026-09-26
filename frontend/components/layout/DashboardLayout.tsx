'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Loading } from '@/components/shared/Loading';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, title }) => {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#FAF7F2]">
        <Loading message="Authenticating session..." />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#FAF7F2]">
        <Loading message="Redirecting to login..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#FAF7F2] text-stone-800">
      <Sidebar role={user.role} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} />
        <main className="p-6 md:p-8 flex-1 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

