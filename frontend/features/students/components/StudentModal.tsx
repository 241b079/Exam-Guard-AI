'use client';

import React, { useState, useEffect } from 'react';
import { X, UserPlus, Edit } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Student } from '../types';
import { studentService } from '../services/studentService';

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentToEdit?: Student | null;
  onSaved: () => void;
}

export const StudentModal: React.FC<StudentModalProps> = ({
  isOpen,
  onClose,
  studentToEdit,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [course, setCourse] = useState('');
  const [semester, setSemester] = useState<number | ''>('');
  const [section, setSection] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (studentToEdit) {
      setName(studentToEdit.name);
      setEmail(studentToEdit.email);
      setStudentId(studentToEdit.student_id);
      setPhone(studentToEdit.phone || '');
      setDepartment(studentToEdit.department || '');
      setCourse(studentToEdit.course || '');
      setSemester(studentToEdit.semester || '');
      setSection(studentToEdit.section || '');
      setDateOfBirth(studentToEdit.date_of_birth || '');
      setGender(studentToEdit.gender || '');
      setAddress(studentToEdit.address || '');
    } else {
      setName('');
      setEmail('');
      setStudentId('');
      setPhone('');
      setDepartment('');
      setCourse('');
      setSemester('');
      setSection('');
      setDateOfBirth('');
      setGender('');
      setAddress('');
    }
  }, [studentToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Full Name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!studentId.trim()) {
      setError('Student ID / Roll Number is required');
      return;
    }

    setIsLoading(true);

    try {
      if (studentToEdit) {
        await studentService.updateStudent(studentToEdit.id, {
          name,
          email,
          phone: phone || undefined,
          department: department || undefined,
          course: course || undefined,
          semester: semester ? Number(semester) : undefined,
          section: section || undefined,
          date_of_birth: dateOfBirth || undefined,
          gender: gender || undefined,
          address: address || undefined,
        });
      } else {
        await studentService.createStudent({
          name,
          email,
          student_id: studentId,
          phone: phone || undefined,
          department: department || undefined,
          course: course || undefined,
          semester: semester ? Number(semester) : undefined,
          section: section || undefined,
          date_of_birth: dateOfBirth || undefined,
          gender: gender || undefined,
          address: address || undefined,
        });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save student record');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="glass-panel w-full max-w-2xl p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150 my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            {studentToEdit ? <Edit className="w-5 h-5 text-brand-400" /> : <UserPlus className="w-5 h-5 text-brand-400" />}
            <h2 className="text-lg font-bold text-white">
              {studentToEdit ? 'Edit Student Details' : 'Add New Student'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name *"
              placeholder="Rahul Kumar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <Input
              label="Email Address *"
              type="email"
              placeholder="rahul@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Student ID / Roll Number *"
              placeholder="CS001"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              disabled={Boolean(studentToEdit)}
              required
            />

            <Input
              label="Phone Number"
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Department"
              placeholder="CSE"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />

            <Input
              label="Course / Program"
              placeholder="B.Tech"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
            />

            <Input
              label="Semester"
              type="number"
              min={1}
              max={12}
              placeholder="4"
              value={semester}
              onChange={(e) => setSemester(e.target.value ? parseInt(e.target.value) : '')}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Section"
              placeholder="A"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            />

            <Input
              label="Date of Birth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />

            <Input
              label="Gender"
              placeholder="Male / Female / Other"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider">
              Address
            </label>
            <textarea
              className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 min-h-[70px]"
              placeholder="Enter full postal address..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isLoading}>
              {studentToEdit ? 'Update Student' : 'Save Student'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
