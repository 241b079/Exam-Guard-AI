'use client';

import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Loading } from '@/components/shared/Loading';
import {
  Student,
  useStudents,
  studentService,
  StudentListTable,
  StudentModal,
  ImportStudentsModal,
  StudentDetailsModal
} from '@/features/students';

export default function FacultyStudentsPage() {
  const {
    students,
    search,
    setSearch,
    department,
    setDepartment,
    status,
    setStatus,
    isLoading,
    error,
    refreshStudents
  } = useStudents();

  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const handleAddStudent = () => {
    setSelectedStudent(null);
    setIsAddEditModalOpen(true);
  };

  const handleEditStudent = (st: Student) => {
    setSelectedStudent(st);
    setIsAddEditModalOpen(true);
  };

  const handleViewStudent = (st: Student) => {
    setSelectedStudent(st);
    setIsDetailsModalOpen(true);
  };

  const handleToggleStatus = async (st: Student) => {
    const action = st.is_active ? 'deactivate' : 'activate';
    if (confirm(`Are you sure you want to ${action} student "${st.name}"?`)) {
      try {
        await studentService.patchStatus(st.id, !st.is_active);
        refreshStudents();
      } catch (err: any) {
        alert(err.message || 'Failed to update student status');
      }
    }
  };

  return (
    <DashboardLayout title="Student Management">
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#EBE5DC]">
          <div>
            <h2 className="text-xl font-bold font-serif text-stone-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#C25E1A]" /> Student Directory
            </h2>
            <p className="text-xs text-stone-500">Manage student accounts, roll numbers, and bulk imports</p>
          </div>
        </div>


        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <Loading message="Fetching student directory..." />
        ) : (
          <StudentListTable
            students={students}
            search={search}
            onSearchChange={setSearch}
            department={department}
            onDeptChange={setDepartment}
            statusFilter={status}
            onStatusChange={setStatus}
            onAddStudent={handleAddStudent}
            onImportStudents={() => setIsImportModalOpen(true)}
            onViewStudent={handleViewStudent}
            onEditStudent={handleEditStudent}
            onToggleStatus={handleToggleStatus}
          />
        )}
      </div>

      <StudentModal
        isOpen={isAddEditModalOpen}
        onClose={() => setIsAddEditModalOpen(false)}
        studentToEdit={selectedStudent}
        onSaved={refreshStudents}
      />

      <ImportStudentsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImported={refreshStudents}
      />

      <StudentDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        student={selectedStudent}
      />
    </DashboardLayout>
  );
}
