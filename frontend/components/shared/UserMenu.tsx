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
        className="flex items-center gap-3 p-1.5 pr-3 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white font-bold text-sm shadow-md">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="text-left hidden sm:block">
          <p className="text-xs font-semibold text-slate-100 leading-tight">{user.name}</p>
          <p className="text-[10px] text-slate-400 leading-tight">{user.role}</p>
        </div>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 p-4 glass-panel rounded-2xl shadow-2xl z-50 border border-slate-700/80 space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Header profile details */}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-400 font-bold text-base">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                <h4 className="text-sm font-bold text-slate-100 truncate">{user.name}</h4>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
                <div className="pt-1">
                  <Badge variant={roleVariant}>{user.role}</Badge>
                </div>
              </div>
            </div>

            {/* Profile summary */}
            <div className="space-y-2 text-xs text-slate-300 bg-slate-800/50 p-2.5 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>Account Status: <strong className="text-emerald-400">Active</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
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
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-colors"
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
