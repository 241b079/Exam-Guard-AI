'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, LayoutDashboard, FileText, Users, User as UserIcon } from 'lucide-react';
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
  ];

  if (role === 'FACULTY') {
    navItems.push({ label: 'Exams', href: '/faculty/exams', icon: FileText });
    navItems.push({ label: 'Students', href: '/faculty/students', icon: Users });
  } else if (role === 'STUDENT') {
    navItems.push({ label: 'Available Exams', href: '/student/exams', icon: FileText });
  } else if (role === 'ADMIN') {
    navItems.push({ label: 'Students', href: '/admin/students', icon: Users });
  }

  return (
    <aside className="w-64 bg-white border-r border-[#EBE5DC] flex flex-col h-screen sticky top-0 shrink-0 shadow-warm-sm">
      {/* Brand Header */}
      <div className="p-6 border-b border-[#EBE5DC] flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[#FBECE0] border border-[#F6D6C0] text-[#C25E1A]">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-bold font-serif text-stone-900 tracking-tight">ExamGuard AI</h2>
          <p className="text-[10px] text-stone-500 uppercase tracking-widest font-semibold">{role} PORTAL</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="p-4 space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== getDashboardLink() && pathname.startsWith(item.href));

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#FBECE0] text-[#C25E1A] font-semibold border border-[#F6D6C0] shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-[#FAF7F2]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / Phase Info */}
      <div className="p-4 border-t border-[#EBE5DC] text-[11px] text-stone-400 text-center">
        <span>Phase 2 — Examination & Students</span>
      </div>
    </aside>
  );
};

