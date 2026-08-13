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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 glass-panel rounded-2xl border border-slate-800">
        <div className="flex flex-1 flex-col sm:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by name, email, roll no, department..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          {/* Department Filter */}
          <select
            value={department}
            onChange={(e) => onDeptChange(e.target.value)}
            className="px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-full sm:w-auto"
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
            className="px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-full sm:w-auto"
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
      <div className="rounded-2xl border border-slate-800 overflow-hidden glass-panel">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="p-3.5">Name</th>
              <th className="p-3.5">Student ID</th>
              <th className="p-3.5">Email</th>
              <th className="p-3.5">Phone</th>
              <th className="p-3.5">Department</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
            {students.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                  No students found matching the selected criteria.
                </td>
              </tr>
            ) : (
              students.map((st) => (
                <tr key={st.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3.5 font-bold text-white">{st.name}</td>
                  <td className="p-3.5 font-mono text-brand-300 font-semibold">{st.student_id}</td>
                  <td className="p-3.5 text-slate-300">{st.email}</td>
                  <td className="p-3.5 text-slate-400">{st.phone || '-'}</td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-200">
                      {st.department || 'N/A'}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <Badge variant={st.is_active ? 'success' : 'danger'}>
                      {st.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onViewStudent(st)}
                        title="View Details"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onEditStudent(st)}
                        title="Edit Student"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-brand-300 hover:bg-slate-800 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onToggleStatus(st)}
                        title={st.is_active ? 'Deactivate Account' : 'Activate Account'}
                        className={`p-1.5 rounded-lg transition-colors ${
                          st.is_active
                            ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10'
                            : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
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
