'use client';

import React, { useState } from 'react';
import { User, LogOut, Shield, Mail, Calendar, UserCheck } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Badge } from '@/components/ui/Badge';

export const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  const roleVariant = user.role === 'STUDENT' ? 'student' : user.role === 'FACULTY' ? 'faculty' : 'admin';

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 p-1.5 pr-3 rounded-full bg-white hover:bg-[#F5EFEB] border border-[#E3DCD2] transition-all focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/40 shadow-warm-sm"
      >
        <div className="w-8 h-8 rounded-full bg-[#C25E1A] flex items-center justify-center text-white font-bold text-sm shadow-sm">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="text-left hidden sm:block">
          <p className="text-xs font-semibold text-stone-900 leading-tight">{user.name}</p>
          <p className="text-[10px] text-stone-500 leading-tight">{user.role}</p>
        </div>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 p-4 bg-white rounded-2xl shadow-warm-lg z-50 border border-[#EBE5DC] space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Header profile details */}
            <div className="flex items-center gap-3 pb-3 border-b border-[#EBE5DC]">
              <div className="w-10 h-10 rounded-full bg-[#FBECE0] border border-[#F6D6C0] flex items-center justify-center text-[#C25E1A] font-bold text-base">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                <h4 className="text-sm font-bold text-stone-900 truncate">{user.name}</h4>
                <p className="text-xs text-stone-500 truncate">{user.email}</p>
                <div className="pt-1">
                  <Badge variant={roleVariant}>{user.role}</Badge>
                </div>
              </div>
            </div>

            {/* Profile summary */}
            <div className="space-y-2 text-xs text-stone-700 bg-[#FAF7F2] p-2.5 rounded-xl border border-[#EBE5DC]">
              <div className="flex items-center gap-2">
                <UserCheck className="w-3.5 h-3.5 text-stone-500" />
                <span>Account Status: <strong className="text-emerald-700">Active</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-stone-500" />
                <span>Joined: {new Date(user.created_at || Date.now()).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

