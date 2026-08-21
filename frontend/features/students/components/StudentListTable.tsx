'use client';

import React from 'react';
import { Search, Eye, Edit, UserCheck, UserX, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Student } from '../types';

interface StudentListTableProps {
  students: Student[];
  search: string;
  onSearchChange: (val: string) => void;
  department: string;
  onDeptChange: (val: string) => void;
  statusFilter: string;
  onStatusChange: (val: string) => void;
  onAddStudent: () => void;
  onImportStudents: () => void;
  onViewStudent: (student: Student) => void;
  onEditStudent: (student: Student) => void;
  onToggleStatus: (student: Student) => void;
}

export const StudentListTable: React.FC<StudentListTableProps> = ({
  students,
  search,
  onSearchChange,
  department,
  onDeptChange,
  statusFilter,
  onStatusChange,
  onAddStudent,
  onImportStudents,
  onViewStudent,
  onEditStudent,
  onToggleStatus,
}) => {
  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm">
        <div className="flex flex-1 flex-col sm:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by name, email, roll no, department..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-[#E2DAD0] rounded-xl text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/20 focus:border-[#C25E1A]"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          {/* Department Filter */}
          <select
            value={department}
            onChange={(e) => onDeptChange(e.target.value)}
            className="px-3 py-2 bg-white border border-[#E2DAD0] rounded-xl text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/20 focus:border-[#C25E1A] w-full sm:w-auto"
          >
            <option value="All">All Departments</option>
            <option value="CSE">CSE</option>
            <option value="ECE">ECE</option>
            <option value="ME">ME</option>
            <option value="EE">EE</option>
            <option value="Civil">Civil</option>
            <option value="IT">IT</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="px-3 py-2 bg-white border border-[#E2DAD0] rounded-xl text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C25E1A]/20 focus:border-[#C25E1A] w-full sm:w-auto"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onImportStudents} className="gap-1.5 text-xs">
            <Upload className="w-3.5 h-3.5" /> Import Students
          </Button>
          <Button variant="primary" size="sm" onClick={onAddStudent} className="gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> Add Student
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-3xl border border-[#EBE5DC] overflow-hidden bg-white shadow-warm">
        <table className="w-full text-left text-xs text-stone-700">
          <thead className="bg-[#FAF7F2] text-stone-500 uppercase tracking-wider text-[11px] font-semibold border-b border-[#EBE5DC]">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Student ID</th>
              <th className="p-4">Email</th>
              <th className="p-4">Phone</th>
              <th className="p-4">Department</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EBE5DC] bg-white">
            {students.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-stone-500 italic">
                  No students found matching the selected criteria.
                </td>
              </tr>
            ) : (
              students.map((st) => (
                <tr key={st.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="p-4 font-bold text-stone-900">{st.name}</td>
                  <td className="p-4 font-mono text-[#C25E1A] font-semibold">{st.student_id}</td>
                  <td className="p-4 text-stone-700">{st.email}</td>
                  <td className="p-4 text-stone-500">{st.phone || '-'}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#FAF7F2] border border-[#E3DCD2] text-[11px] font-semibold text-stone-700">
                      {st.department || 'N/A'}
                    </span>
                  </td>
                  <td className="p-4">
                    <Badge variant={st.is_active ? 'success' : 'danger'}>
                      {st.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onViewStudent(st)}
                        title="View Details"
                        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-[#FAF7F2] transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onEditStudent(st)}
                        title="Edit Student"
                        className="p-1.5 rounded-lg text-stone-500 hover:text-[#C25E1A] hover:bg-[#FAF7F2] transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onToggleStatus(st)}
                        title={st.is_active ? 'Deactivate Account' : 'Activate Account'}
                        className={`p-1.5 rounded-lg transition-colors ${
                          st.is_active
                            ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                            : 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50'
                        }`}
                      >
                        {st.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

