'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { adminService, GlobalExamItem } from '@/features/admin';
import {
  FileText,
  Search,
  RefreshCw,
  Trash2,
  Globe,
  Lock,
  Clock,
  Layers,
  HelpCircle,
  User,
} from 'lucide-react';

export default function AdminExamsPage() {
  const [exams, setExams] = useState<GlobalExamItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<GlobalExamItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchExams = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const data = await adminService.listGlobalExams();
      setExams(data);
    } catch (err: any) {
      setActionError(err.message || 'Failed to fetch global exams');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const filteredExams = exams.filter((ex) => {
    const matchesStatus = statusFilter === 'ALL' || ex.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      ex.title.toLowerCase().includes(q) ||
      ex.creator_name.toLowerCase().includes(q) ||
      ex.creator_email.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const handleTogglePublish = async (exam: GlobalExamItem) => {
    try {
      if (exam.status === 'PUBLISHED') {
        await adminService.unpublishExam(exam.id);
      } else {
        await adminService.publishExam(exam.id);
      }
      fetchExams();
    } catch (err: any) {
      alert(err.message || 'Failed to update exam publish state');
    }
  };

  const handleDeleteExam = async () => {
    if (!selectedExam) return;
    try {
      await adminService.deleteExam(selectedExam.id);
      setIsDeleteModalOpen(false);
      setSelectedExam(null);
      fetchExams();
    } catch (err: any) {
      alert(err.message || 'Failed to delete exam');
    }
  };

  return (
    <DashboardLayout title="Admin — Global Exam Catalog">
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBE5DC]">
          <div>
            <h2 className="text-xl font-bold font-serif text-stone-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#1E5D88]" />
              Global Exam Catalog & Auditing
            </h2>
            <p className="text-xs text-stone-600">
              Audit, oversee, force publish/unpublish, and clean up exams created by faculty platform-wide.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchExams}
            disabled={isLoading}
            className="gap-1.5 text-xs self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Catalog
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search by exam title, creator name, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <Select
            options={[
              { label: 'All Lifecycle Statuses', value: 'ALL' },
              { label: 'Published (Active)', value: 'PUBLISHED' },
              { label: 'Drafts', value: 'DRAFT' },
              { label: 'Closed / Archived', value: 'CLOSED' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>

        {/* Catalog Table */}
        <Card className="p-0 overflow-hidden border border-[#EBE5DC]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF7F2] border-b border-[#EBE5DC] text-stone-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Exam Title & Details</th>
                  <th className="px-4 py-3">Faculty Creator</th>
                  <th className="px-4 py-3">Metrics</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE5DC]">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#1E5D88]" />
                      Loading global exam catalog...
                    </td>
                  </tr>
                ) : filteredExams.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                      No exams match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredExams.map((ex) => (
                    <tr key={ex.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-stone-900">{ex.title}</div>
                        <div className="flex items-center gap-3 text-[11px] text-stone-500 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {ex.duration_minutes} min
                          </span>
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {ex.assignment_type}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-stone-900 flex items-center gap-1">
                          <User className="w-3 h-3 text-stone-400" />
                          {ex.creator_name}
                        </div>
                        <div className="text-[11px] text-stone-500">{ex.creator_email}</div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-stone-700">
                          <strong>{ex.question_count}</strong> questions
                        </div>
                        <div className="text-[11px] text-stone-500">
                          {ex.attempts_count} candidate attempts
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            ex.status === 'PUBLISHED'
                              ? 'success'
                              : ex.status === 'DRAFT'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {ex.status}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleTogglePublish(ex)}
                            className="text-[11px] px-2.5 py-1 h-auto"
                          >
                            {ex.status === 'PUBLISHED' ? (
                              <>
                                <Lock className="w-3 h-3 mr-1 text-amber-600" />
                                Unpublish
                              </>
                            ) : (
                              <>
                                <Globe className="w-3 h-3 mr-1 text-emerald-600" />
                                Publish
                              </>
                            )}
                          </Button>

                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setSelectedExam(ex);
                              setIsDeleteModalOpen(true);
                            }}
                            className="text-[11px] px-2 py-1 h-auto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Modal: Delete Exam */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Delete Exam from Platform"
        >
          <div className="space-y-4">
            <p className="text-xs text-stone-700">
              Are you sure you want to permanently delete exam{' '}
              <strong>"{selectedExam?.title}"</strong> created by{' '}
              <strong>{selectedExam?.creator_name}</strong>?
              All questions, candidate attempts, submissions, and proctoring events will be permanently purged.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteExam}>
                Confirm Delete
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
