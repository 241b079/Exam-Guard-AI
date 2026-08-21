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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg p-6 md:p-8 rounded-3xl border border-[#EBE5DC] shadow-warm-lg space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[#EBE5DC] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0] flex items-center justify-center font-bold text-base">
              {student.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-base font-bold font-serif text-stone-900">{student.name}</h2>
              <p className="text-xs text-[#C25E1A] font-mono">Roll No: {student.student_id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-[#FAF7F2]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC]">
            <span className="text-stone-600 font-medium">Account Status</span>
            <Badge variant={student.is_active ? 'success' : 'danger'}>
              {student.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-stone-700">
            <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] space-y-1">
              <span className="text-[10px] text-stone-500 font-semibold uppercase flex items-center gap-1">
                <Mail className="w-3 h-3 text-[#C25E1A]" /> Email Address
              </span>
              <p className="font-medium text-stone-900 truncate">{student.email}</p>
            </div>

            <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] space-y-1">
              <span className="text-[10px] text-stone-500 font-semibold uppercase flex items-center gap-1">
                <Phone className="w-3 h-3 text-[#C25E1A]" /> Phone Number
              </span>
              <p className="font-medium text-stone-900">{student.phone || 'N/A'}</p>
            </div>

            <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] space-y-1">
              <span className="text-[10px] text-stone-500 font-semibold uppercase flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-[#C25E1A]" /> Department / Course
              </span>
              <p className="font-medium text-stone-900">
                {student.department || 'N/A'} {student.course ? `(${student.course})` : ''}
              </p>
            </div>

            <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] space-y-1">
              <span className="text-[10px] text-stone-500 font-semibold uppercase flex items-center gap-1">
                <Calendar className="w-3 h-3 text-amber-700" /> Sem & Section
              </span>
              <p className="font-medium text-stone-900">
                Sem {student.semester || 'N/A'} {student.section ? `— Sec ${student.section}` : ''}
              </p>
            </div>
          </div>

          {student.address && (
            <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBE5DC] space-y-1">
              <span className="text-[10px] text-stone-500 font-semibold uppercase flex items-center gap-1">
                <MapPin className="w-3 h-3 text-rose-600" /> Address
              </span>
              <p className="text-stone-700">{student.address}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-[#EBE5DC]">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

