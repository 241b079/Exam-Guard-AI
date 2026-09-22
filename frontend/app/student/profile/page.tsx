'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fetchApi } from '@/lib/api';
import { StudentProfile } from '@/types';
import {
  User,
  Lock,
  Unlock,
  Camera,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Phone,
  BookOpen,
  Hash,
  Mail,
  Building,
  MapPin,
  Clock,
  Sparkles
} from 'lucide-react';

const ALLOWED_BATCHES = ['B1', 'B2', 'B3', 'B4', 'B5'];

export default function StudentProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    batch: '',
    phone: '',
    course: '',
    semester: '',
    section: '',
    date_of_birth: '',
    gender: '',
    address: '',
  });

  const loadProfile = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await fetchApi<StudentProfile>('/api/v1/students/me');
      setProfile(data);
      setFormData({
        name: data.name || '',
        batch: data.batch || '',
        phone: data.phone || '',
        course: data.course || '',
        semester: data.semester ? String(data.semester) : '',
        section: data.section || '',
        date_of_birth: data.date_of_birth || '',
        gender: data.gender || '',
        address: data.address || '',
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const isFieldEditable = (fieldName: string): boolean => {
    if (!profile) return false;
    // 1. If profile is not yet completed, everything is editable for initial setup
    if (!profile.profile_completed) return true;
    // 2. If profile is completed and active permission exists, check if field is in allowed_fields
    if (profile.active_permission && profile.active_permission.status === 'ACTIVE') {
      return (profile.active_permission.allowed_fields || []).includes(fieldName);
    }
    // 3. Otherwise locked
    return false;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if photo is allowed to be edited
    if (profile?.profile_completed && !isFieldEditable('profile_picture_url')) {
      setErrorMessage('Profile photo is locked. You need faculty permission to change your photo.');
      return;
    }

    try {
      setUploadingPhoto(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const form = new FormData();
      form.append('file', file);

      const updated = await fetchApi<StudentProfile>('/api/v1/students/me/photo', {
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

    // Validate batch
    if (formData.batch && !ALLOWED_BATCHES.includes(formData.batch)) {
      setErrorMessage(`Please select a valid batch (${ALLOWED_BATCHES.join(', ')}).`);
      return;
    }

    try {
      setSaving(true);

      const payload: Record<string, any> = {};

      // Only include fields that are editable
      if (isFieldEditable('name')) payload.name = formData.name.trim();
      if (isFieldEditable('batch')) payload.batch = formData.batch ? formData.batch.trim().toUpperCase() : null;
      if (isFieldEditable('phone')) payload.phone = formData.phone.trim() || null;
      if (isFieldEditable('course')) payload.course = formData.course.trim() || null;
      if (isFieldEditable('semester')) payload.semester = formData.semester ? parseInt(formData.semester, 10) : null;
      if (isFieldEditable('section')) payload.section = formData.section.trim() || null;
      if (isFieldEditable('date_of_birth')) payload.date_of_birth = formData.date_of_birth || null;
      if (isFieldEditable('gender')) payload.gender = formData.gender || null;
      if (isFieldEditable('address')) payload.address = formData.address.trim() || null;

      const updated = await fetchApi<StudentProfile>('/api/v1/students/me/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      setProfile(updated);
      if (!profile?.profile_completed) {
        setSuccessMessage('Profile successfully completed and locked for examination security!');
      } else {
        setSuccessMessage('Profile changes saved successfully! Your permission has now been consumed and your profile is locked.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Student Profile">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-[#C25E1A] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-stone-500 font-medium">Loading your profile...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!profile) return null;

  const isLocked = profile.profile_completed && !profile.active_permission;
  const hasActivePermission = profile.profile_completed && Boolean(profile.active_permission);

  return (
    <DashboardLayout title="Student Profile">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Alerts & Notifications */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-sm shadow-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Action Failed</p>
              <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-3 text-sm shadow-sm animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Success</p>
              <p className="text-xs text-emerald-700 mt-0.5">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Profile Status Banner */}
        {!profile.profile_completed && (
          <div className="p-5 rounded-3xl bg-amber-50 border border-amber-200 text-amber-900 shadow-sm flex items-start gap-4">
            <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-900">Complete Your Student Profile</h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                Welcome to ExamGuard AI! Please fill in your student profile details and assign your <strong>Batch (B1–B5)</strong>.
                Once submitted, your academic profile will be <strong>locked</strong> to maintain proctoring integrity.
              </p>
            </div>
          </div>
        )}

        {isLocked && (
          <div className="p-5 rounded-3xl bg-stone-50 border border-[#E3DCD2] text-stone-800 shadow-sm flex items-start gap-4">
            <div className="p-2.5 rounded-2xl bg-[#F5EFEB] text-stone-600 border border-[#E3DCD2] shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-stone-900">Profile is Locked</h3>
                <Badge variant="outline" className="bg-stone-200 text-stone-700 border-stone-300 text-[10px]">
                  Protected
                </Badge>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Your profile information is strictly protected to preserve examination and identity verification integrity.
                If you need to change your batch, name, or phone number, please contact your course faculty to request an edit permission.
              </p>
            </div>
          </div>
        )}

        {hasActivePermission && profile.active_permission && (
          <div className="p-5 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-950 shadow-sm flex items-start gap-4">
            <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-700 border border-emerald-300 shrink-0">
              <Unlock className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-emerald-900">Faculty Edit Permission Active</h3>
                  <Badge variant="success" className="text-[10px]">Temporary Access</Badge>
                </div>
                {profile.active_permission.expires_at && (
                  <span className="text-[11px] text-emerald-700 flex items-center gap-1 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    Expires: {new Date(profile.active_permission.expires_at).toLocaleString()}
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Granted by <strong>{profile.active_permission.granted_by_name}</strong>. You are permitted to modify:{' '}
                <strong className="underline font-semibold">
                  {(profile.active_permission.allowed_fields || []).join(', ')}
                </strong>
                . Once you save your changes, this permission will be automatically consumed and the profile will re-lock.
              </p>
              {profile.active_permission.notes && (
                <p className="text-[11px] text-emerald-700 italic bg-white/60 p-2 rounded-xl border border-emerald-200">
                  Note: {profile.active_permission.notes}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Profile Card */}
        <Card className="p-6 md:p-8 bg-white border-[#EBE5DC] shadow-warm">
          {/* Header with Photo & Quick Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-8 border-b border-[#EBE5DC]">
            {/* Avatar with Camera Overlay */}
            <div className="relative group">
              <div className="w-28 h-28 rounded-3xl overflow-hidden bg-[#FBECE0] border-2 border-[#F6D6C0] flex items-center justify-center shadow-warm-sm">
                {profile.profile_picture_url ? (
                  <img
                    src={profile.profile_picture_url}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-[#C25E1A]" />
                )}
              </div>

              {/* Photo Upload Overlay if editable */}
              {isFieldEditable('profile_picture_url') && (
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
              )}
            </div>

            {/* Quick Details */}
            <div className="space-y-2 text-center sm:text-left flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-bold font-serif text-stone-900">{profile.name}</h2>
                  <p className="text-xs text-stone-500">{profile.email}</p>
                </div>
                <div className="flex items-center gap-2 justify-center sm:justify-end">
                  <Badge variant="student">Student</Badge>
                  {profile.batch && (
                    <Badge variant="outline" className="bg-[#FAF7F2] border-[#E3DCD2] text-[#C25E1A] font-bold">
                      Batch {profile.batch}
                    </Badge>
                  )}
                  {profile.profile_completed ? (
                    <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700">
                      <ShieldCheck className="w-3 h-3 mr-1 inline" /> Verified
                    </Badge>
                  ) : (
                    <Badge variant="warning">Incomplete</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs text-stone-600">
                <div className="bg-[#FAF7F2] p-2 rounded-xl border border-[#EBE5DC]">
                  <span className="text-[10px] text-stone-400 block uppercase font-medium">Roll Number</span>
                  <strong className="text-stone-900">{profile.student_id}</strong>
                </div>
                <div className="bg-[#FAF7F2] p-2 rounded-xl border border-[#EBE5DC]">
                  <span className="text-[10px] text-stone-400 block uppercase font-medium">Batch</span>
                  <strong className="text-stone-900">{profile.batch || 'Not Assigned'}</strong>
                </div>
                <div className="bg-[#FAF7F2] p-2 rounded-xl border border-[#EBE5DC]">
                  <span className="text-[10px] text-stone-400 block uppercase font-medium">Semester</span>
                  <strong className="text-stone-900">{profile.semester ? `Semester ${profile.semester}` : '—'}</strong>
                </div>
                <div className="bg-[#FAF7F2] p-2 rounded-xl border border-[#EBE5DC]">
                  <span className="text-[10px] text-stone-400 block uppercase font-medium">Status</span>
                  <strong className="text-emerald-700">{profile.is_active ? 'Active' : 'Inactive'}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Edit Form */}
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Full Name */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">Full Name</label>
                  {!isFieldEditable('name') ? (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold">
                      <Unlock className="w-3 h-3" /> Editable
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={!isFieldEditable('name')}
                  required
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border transition-all ${
                    isFieldEditable('name')
                      ? 'bg-white border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/30 text-stone-900'
                      : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed'
                  }`}
                  placeholder="Student Full Name"
                />
              </div>

              {/* Student ID (Always strictly read-only) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">Student ID / Roll Number</label>
                  <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium">
                    <Lock className="w-3 h-3" /> System Managed
                  </span>
                </div>
                <input
                  type="text"
                  value={profile.student_id}
                  disabled
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed font-mono"
                />
              </div>

              {/* Batch Selector (B1 - B5) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">Academic Batch</label>
                  {!isFieldEditable('batch') ? (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold">
                      <Unlock className="w-3 h-3" /> Editable
                    </span>
                  )}
                </div>
                <select
                  value={formData.batch}
                  onChange={(e) => setFormData({ ...formData, batch: e.target.value })}
                  disabled={!isFieldEditable('batch')}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border transition-all ${
                    isFieldEditable('batch')
                      ? 'bg-white border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/30 text-stone-900 font-semibold'
                      : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed'
                  }`}
                >
                  <option value="">-- Select Assigned Batch --</option>
                  {ALLOWED_BATCHES.map((b) => (
                    <option key={b} value={b}>
                      Batch {b}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-stone-400">
                  Batches are used for exam cohort scheduling and proctor assignment.
                </p>
              </div>

              {/* Phone Number */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">Phone Number</label>
                  {!isFieldEditable('phone') ? (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold">
                      <Unlock className="w-3 h-3" /> Editable
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={!isFieldEditable('phone')}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border transition-all ${
                    isFieldEditable('phone')
                      ? 'bg-white border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/30 text-stone-900'
                      : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed'
                  }`}
                  placeholder="+91 9876543210"
                />
              </div>

              {/* Course */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">Degree / Program</label>
                  {!isFieldEditable('course') ? (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold">
                      <Unlock className="w-3 h-3" /> Editable
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={formData.course}
                  onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                  disabled={!isFieldEditable('course')}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border transition-all ${
                    isFieldEditable('course')
                      ? 'bg-white border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/30 text-stone-900'
                      : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed'
                  }`}
                  placeholder="e.g. B.Tech Computer Science"
                />
              </div>

              {/* Semester */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">Semester</label>
                  {!isFieldEditable('semester') ? (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold">
                      <Unlock className="w-3 h-3" /> Editable
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={formData.semester}
                  onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                  disabled={!isFieldEditable('semester')}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border transition-all ${
                    isFieldEditable('semester')
                      ? 'bg-white border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/30 text-stone-900'
                      : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed'
                  }`}
                  placeholder="e.g. 4"
                />
              </div>

              {/* Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">Section</label>
                  {!isFieldEditable('section') ? (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold">
                      <Unlock className="w-3 h-3" /> Editable
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={formData.section}
                  onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                  disabled={!isFieldEditable('section')}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border transition-all ${
                    isFieldEditable('section')
                      ? 'bg-white border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/30 text-stone-900'
                      : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed'
                  }`}
                  placeholder="e.g. A"
                />
              </div>

              {/* Date of Birth */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">Date of Birth</label>
                  {!isFieldEditable('date_of_birth') ? (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold">
                      <Unlock className="w-3 h-3" /> Editable
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                  disabled={!isFieldEditable('date_of_birth')}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border transition-all ${
                    isFieldEditable('date_of_birth')
                      ? 'bg-white border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/30 text-stone-900'
                      : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed'
                  }`}
                />
              </div>

              {/* Gender */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">Gender</label>
                  {!isFieldEditable('gender') ? (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold">
                      <Unlock className="w-3 h-3" /> Editable
                    </span>
                  )}
                </div>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  disabled={!isFieldEditable('gender')}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border transition-all ${
                    isFieldEditable('gender')
                      ? 'bg-white border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/30 text-stone-900'
                      : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed'
                  }`}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Residential Address */}
              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">Residential Address</label>
                  {!isFieldEditable('address') ? (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold">
                      <Unlock className="w-3 h-3" /> Editable
                    </span>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  disabled={!isFieldEditable('address')}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border transition-all ${
                    isFieldEditable('address')
                      ? 'bg-white border-[#C25E1A] focus:ring-2 focus:ring-[#C25E1A]/30 text-stone-900'
                      : 'bg-[#FAF7F2] border-[#EBE5DC] text-stone-500 cursor-not-allowed'
                  }`}
                  placeholder="Enter full address"
                />
              </div>
            </div>

            {/* Actions Bar */}
            <div className="pt-6 border-t border-[#EBE5DC] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-stone-500">
                {isLocked ? (
                  <span className="flex items-center gap-1.5 text-stone-500">
                    <Lock className="w-3.5 h-3.5 text-stone-400" />
                    All profile fields are locked. Request faculty permission to enable updates.
                  </span>
                ) : hasActivePermission ? (
                  <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                    <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                    Saving will apply changes and consume your active edit permission.
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-700 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Completing your profile will lock your data for official examination records.
                  </span>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={isLocked || saving}
                className={`gap-2 text-xs shadow-warm-sm px-6 py-2.5 ${
                  isLocked ? 'opacity-50 cursor-not-allowed bg-stone-300 border-stone-400 text-stone-600' : ''
                }`}
              >
                {saving ? (
                  <>Saving...</>
                ) : !profile.profile_completed ? (
                  <>Complete & Lock Profile</>
                ) : hasActivePermission ? (
                  <>Save Permitted Changes</>
                ) : (
                  <>Profile Locked</>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}
