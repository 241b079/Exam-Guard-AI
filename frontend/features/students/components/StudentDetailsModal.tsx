'use client';

import React from 'react';
import { X, UserCheck, UserX, Mail, Phone, BookOpen, Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Student } from '../types';

interface StudentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
}

export const StudentDetailsModal: React.FC<StudentDetailsModalProps> = ({
  isOpen,
  onClose,
  student,
}) => {
  if (!isOpen || !student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-lg p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/30 flex items-center justify-center font-bold text-lg">
              {student.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{student.name}</h2>
              <p className="text-xs text-brand-300 font-mono">Roll No: {student.student_id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-medium">Account Status</span>
            <Badge variant={student.is_active ? 'success' : 'danger'}>
              {student.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300">
            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase flex items-center gap-1">
                <Mail className="w-3 h-3 text-brand-400" /> Email Address
              </span>
              <p className="font-medium text-slate-200">{student.email}</p>
            </div>

            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase flex items-center gap-1">
                <Phone className="w-3 h-3 text-brand-400" /> Phone Number
              </span>
              <p className="font-medium text-slate-200">{student.phone || 'N/A'}</p>
            </div>

            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-purple-400" /> Department / Course
              </span>
              <p className="font-medium text-slate-200">
                {student.department || 'N/A'} {student.course ? `(${student.course})` : ''}
              </p>
            </div>

            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase flex items-center gap-1">
                <Calendar className="w-3 h-3 text-amber-400" /> Sem & Section
              </span>
              <p className="font-medium text-slate-200">
                Sem {student.semester || 'N/A'} {student.section ? `— Sec ${student.section}` : ''}
              </p>
            </div>
          </div>

          {student.address && (
            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase flex items-center gap-1">
                <MapPin className="w-3 h-3 text-rose-400" /> Address
              </span>
              <p className="text-slate-300">{student.address}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
