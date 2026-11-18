'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { adminService, AdminUser } from '@/features/admin';
import { UserRole } from '@/types';
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  CheckCircle,
  XCircle,
  Edit2,
  Lock,
} from 'lucide-react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Form states
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('STUDENT');
  const [editRole, setEditRole] = useState<UserRole>('STUDENT');
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const activeParam = statusFilter === 'ACTIVE' ? true : statusFilter === 'INACTIVE' ? false : undefined;
      const data = await adminService.listUsers(roleFilter, activeParam);
      setUsers(data);
    } catch (err: any) {
      setActionError(err.message || 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter, statusFilter]);

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await adminService.createUser({
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
      });
      setIsCreateModalOpen(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      fetchUsers();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create user');
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    setActionError(null);
    try {
      await adminService.updateUserRole(selectedUser.id, editRole);
      setIsRoleModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update user role');
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    try {
      await adminService.updateUserStatus(user.id, !user.is_active);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      await adminService.deleteUser(selectedUser.id);
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    }
  };

  return (
    <DashboardLayout title="Admin — User Directory">
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBE5DC]">
          <div>
            <h2 className="text-xl font-bold font-serif text-stone-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#C25E1A]" />
              User & Identity Management
            </h2>
            <p className="text-xs text-stone-600">
              Manage accounts, roles, authorization privileges, and access states across the platform.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchUsers}
              disabled={isLoading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setActionError(null);
                setIsCreateModalOpen(true);
              }}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add User
            </Button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <Select
            options={[
              { label: 'All Roles', value: 'ALL' },
              { label: 'Students', value: 'STUDENT' },
              { label: 'Faculty', value: 'FACULTY' },
              { label: 'Administrators', value: 'ADMIN' },
            ]}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          />

          <Select
            options={[
              { label: 'All Account Statuses', value: 'ALL' },
              { label: 'Active Accounts Only', value: 'ACTIVE' },
              { label: 'Inactive Accounts Only', value: 'INACTIVE' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>

        {/* Users Table */}
        <Card className="p-0 overflow-hidden border border-[#EBE5DC]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF7F2] border-b border-[#EBE5DC] text-stone-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Registered On</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE5DC]">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#C25E1A]" />
                      Loading user accounts...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                      No users match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-stone-900">{u.name}</div>
                        <div className="text-[11px] text-stone-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            u.role === 'ADMIN'
                              ? 'admin'
                              : u.role === 'FACULTY'
                              ? 'faculty'
                              : 'student'
                          }
                        >
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            u.is_active ? 'text-emerald-700' : 'text-stone-400'
                          }`}
                        >
                          {u.is_active ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-stone-400" />
                          )}
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-stone-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(u);
                              setEditRole(u.role);
                              setIsRoleModalOpen(true);
                            }}
                            className="text-[11px] px-2.5 py-1 h-auto"
                          >
                            <Shield className="w-3 h-3 mr-1" />
                            Role
                          </Button>

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleToggleStatus(u)}
                            className="text-[11px] px-2.5 py-1 h-auto"
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </Button>

                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(u);
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

        {/* Modal: Create User */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Create New User Account"
        >
          <form onSubmit={handleCreateUser} className="space-y-4">
            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                {actionError}
              </div>
            )}
            <Input
              label="Full Name"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Dr. Robert Chen"
            />
            <Input
              label="Email Address"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e.g. robert.chen@university.edu"
            />
            <Input
              label="Password"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
            <Select
              label="Account Role"
              options={[
                { label: 'Student', value: 'STUDENT' },
                { label: 'Faculty', value: 'FACULTY' },
                { label: 'Administrator', value: 'ADMIN' },
              ]}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create User</Button>
            </div>
          </form>
        </Modal>

        {/* Modal: Change Role */}
        <Modal
          isOpen={isRoleModalOpen}
          onClose={() => setIsRoleModalOpen(false)}
          title="Change User Authorization Role"
        >
          <div className="space-y-4">
            <p className="text-xs text-stone-600">
              Updating the role for <strong>{selectedUser?.name}</strong> ({selectedUser?.email}).
            </p>
            <Select
              label="Target Role"
              options={[
                { label: 'Student', value: 'STUDENT' },
                { label: 'Faculty', value: 'FACULTY' },
                { label: 'Administrator', value: 'ADMIN' },
              ]}
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as UserRole)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setIsRoleModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateRole}>Save Role</Button>
            </div>
          </div>
        </Modal>

        {/* Modal: Delete Confirmation */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Confirm User Account Deletion"
        >
          <div className="space-y-4">
            <p className="text-xs text-stone-700">
              Are you sure you want to permanently delete user{' '}
              <strong>{selectedUser?.name}</strong> ({selectedUser?.email})?
              All associated student/faculty profile records will be permanently removed.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteUser}>
                Confirm Delete
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
