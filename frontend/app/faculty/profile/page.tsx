'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fetchApi, getImageUrl } from '@/lib/api';
import { FacultyProfile } from '@/types';
import {
  User,
  Camera,
  CheckCircle2,
  AlertCircle,
  Building,
  GraduationCap,
  Phone,
  Layers,
  Save,
  Shield
} from 'lucide-react';

const ALLOWED_BATCHES = ['B1', 'B2', 'B3', 'B4', 'B5'];

export default function FacultyProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<FacultyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    department: '',
    designation: '',
    assigned_batches: [] as string[],
  });

  const loadProfile = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await fetchApi<FacultyProfile>('/api/v1/faculty/me');
      setProfile(data);
      setFormData({
        name: data.name || '',
        phone: data.phone || '',
        department: data.department || '',
        designation: data.designation || '',
        assigned_batches: data.assigned_batches || [],
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load faculty profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleBatchToggle = (batch: string) => {
    setFormData((prev) => {
      const exists = prev.assigned_batches.includes(batch);
      const updated = exists
        ? prev.assigned_batches.filter((b) => b !== batch)
        : [...prev.assigned_batches, batch];
      return { ...prev, assigned_batches: updated };
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingPhoto(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const form = new FormData();
      form.append('file', file);

      const updated = await fetchApi<FacultyProfile>('/api/v1/faculty/me/photo', {
        method: 'POST',
        body: form,
      });

      setProfile(updated);
      setSuccessMessage('Profile photo updated successfully!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      setSaving(true);
      const updated = await fetchApi<FacultyProfile>('/api/v1/faculty/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: formData.name.trim(),
          phone: formData.phone.trim() || null,
          department: formData.department.trim() || null,
          designation: formData.designation.trim() || null,
          assigned_batches: formData.assigned_batches,
        }),
      });

      setProfile(updated);
      setSuccessMessage('Faculty profile details saved successfully!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Faculty Profile">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-[#C25E1A] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-stone-500 font-medium">Loading faculty profile...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!profile) return null;

  return (
    <DashboardLayout title="Faculty Profile">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Alerts */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-sm shadow-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Update Failed</p>
              <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-3 text-sm shadow-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Changes Saved</p>
              <p className="text-xs text-emerald-700 mt-0.5">{successMessage}</p>
            </div>
          </div>
        )}

        <Card className="p-6 md:p-8 bg-white border-[#EBE5DC] shadow-warm">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-8 border-b border-[#EBE5DC]">
            {/* Avatar */}
            <div className="relative group">
              <div className="w-28 h-28 rounded-3xl overflow-hidden bg-[#FBECE0] border-2 border-[#F6D6C0] flex items-center justify-center shadow-warm-sm">
                {profile.profile_picture_url ? (
                  <img
                    src={getImageUrl(profile.profile_picture_url)}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-[#C25E1A]" />
                )}
              </div>

              <label className="absolute inset-0 bg-black/40 rounded-3xl flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Camera className="w-6 h-6 mb-1" />
                <span className="text-[10px] font-semibold">
                  {uploadingPhoto ? 'Uploading...' : 'Change'}
                </span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                />
              </label>
            </div>

            {/* Quick Details */}
            <div className="space-y-2 text-center sm:text-left flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-bold font-serif text-stone-900">{profile.name}</h2>
                  <p className="text-xs text-stone-500">{profile.email}</p>
                </div>
                <div className="flex items-center gap-2 justify-center sm:justify-end">
                  <Badge variant="faculty">Faculty Member</Badge>
                  <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700">
                    <Shield className="w-3 h-3 mr-1 inline" /> Active Proctor
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs text-stone-600">
                <div className="bg-[#FAF7F2] p-2 rounded-xl border border-[#EBE5DC]">
                  <span className="text-[10px] text-stone-400 block uppercase font-medium">Faculty ID</span>
                  <strong className="text-stone-900 font-mono">{profile.faculty_id}</strong>
                </div>
                <div className="bg-[#FAF7F2] p-2 rounded-xl border border-[#EBE5DC]">
                  <span className="text-[10px] text-stone-400 block uppercase font-medium">Department</span>
                  <strong className="text-stone-900">{profile.department || 'Not Assigned'}</strong>
                </div>
                <div className="bg-[#FAF7F2] p-2 rounded-xl border border-[#EBE5DC]">
                  <span className="text-[10px] text-stone-400 block uppercase font-medium">Designation</span>
                  <strong className="text-stone-900">{profile.designation || 'Instructor'}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Edit Form */}
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700">Full Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border bg-white border-[#EBE5DC] focus:border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/20 transition-all text-stone-900"
                />
              </div>

              {/* Faculty ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700">Faculty Identifier</label>
                <input
                  type="text"
                  value={profile.faculty_id}
                  disabled
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed font-mono"
                />
              </div>

              {/* Department */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700">Department</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="e.g. Computer Science & Engineering"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border bg-white border-[#EBE5DC] focus:border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/20 transition-all text-stone-900"
                />
              </div>

              {/* Designation */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700">Academic Designation</label>
                <input
                  type="text"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="e.g. Associate Professor / Proctor"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border bg-white border-[#EBE5DC] focus:border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/20 transition-all text-stone-900"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700">Contact Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border bg-white border-[#EBE5DC] focus:border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/20 transition-all text-stone-900"
                />
              </div>

              {/* Assigned Batches */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-stone-700 block">Assigned Examination Batches</label>
                <p className="text-[11px] text-stone-500 mb-2">
                  Select the batches you teach or manage permissions and proctoring for:
                </p>
                <div className="flex flex-wrap gap-3">
                  {ALLOWED_BATCHES.map((batch) => {
                    const checked = formData.assigned_batches.includes(batch);
                    return (
                      <button
                        type="button"
                        key={batch}
                        onClick={() => handleBatchToggle(batch)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                          checked
                            ? 'bg-[#C25E1A] text-white border-[#C25E1A] shadow-warm-sm'
                            : 'bg-[#FAF7F2] text-stone-700 border-[#EBE5DC] hover:border-stone-400'
                        }`}
                      >
                        <span>Batch {batch}</span>
                        {checked && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-6 border-t border-[#EBE5DC] flex items-center justify-between">
              <span className="text-xs text-stone-500">Faculty profile can be updated at any time.</span>
              <Button type="submit" variant="primary" disabled={saving} className="gap-2 text-xs shadow-warm-sm px-6">
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Faculty Profile'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}
