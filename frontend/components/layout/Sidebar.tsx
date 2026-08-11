'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, LayoutDashboard, User as UserIcon } from 'lucide-react';
import { UserRole } from '@/types';

interface SidebarProps {
  role: UserRole;
}

export const Sidebar: React.FC<SidebarProps> = ({ role }) => {
  const pathname = usePathname();

  const getDashboardLink = () => {
    switch (role) {
      case 'STUDENT': return '/student/dashboard';
      case 'FACULTY': return '/faculty/dashboard';
      case 'ADMIN': return '/admin/dashboard';
    }
  };

  const navItems = [
    { label: 'Dashboard', href: getDashboardLink(), icon: LayoutDashboard },
    { label: 'Profile', href: getDashboardLink(), icon: UserIcon },
  ];

  return (
    <aside className="w-64 glass-panel border-r border-slate-800 flex flex-col h-screen sticky top-0 shrink-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">ExamGuard AI</h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">{role} PORTAL</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="p-4 space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / Phase Info */}
      <div className="p-4 border-t border-slate-800 text-[11px] text-slate-500 text-center">
        <span>Phase 1 — Auth & Dashboard Shell</span>
      </div>
    </aside>
  );
};
