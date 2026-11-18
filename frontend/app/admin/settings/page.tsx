'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { adminService, AdminSettings } from '@/features/admin';
import {
  Settings,
  Shield,
  Eye,
  Camera,
  Volume2,
  RefreshCw,
  CheckCircle,
  Save,
  AlertCircle,
} from 'lucide-react';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form local state
  const [faceThreshold, setFaceThreshold] = useState(0.35);
  const [multiplePersonGrace, setMultiplePersonGrace] = useState(3.0);
  const [lookingAwayGrace, setLookingAwayGrace] = useState(3.0);
  const [objectDetection, setObjectDetection] = useState(true);
  const [audioDetection, setAudioDetection] = useState(true);
  const [strictLockdown, setStrictLockdown] = useState(true);
  const [maxRejoins, setMaxRejoins] = useState(3);
  const [announcement, setAnnouncement] = useState('');

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const data = await adminService.getSettings();
      setSettings(data);
      setFaceThreshold(data.face_match_threshold);
      setMultiplePersonGrace(data.multiple_person_grace_sec);
      setLookingAwayGrace(data.looking_away_threshold_sec);
      setObjectDetection(data.object_detection_enabled);
      setAudioDetection(data.audio_anomaly_detection_enabled);
      setStrictLockdown(data.strict_lockdown_enabled);
      setMaxRejoins(data.max_rejoins_allowed);
      setAnnouncement(data.system_announcement || '');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const updated = await adminService.updateSettings({
        face_match_threshold: faceThreshold,
        multiple_person_grace_sec: multiplePersonGrace,
        looking_away_threshold_sec: lookingAwayGrace,
        object_detection_enabled: objectDetection,
        audio_anomaly_detection_enabled: audioDetection,
        strict_lockdown_enabled: strictLockdown,
        max_rejoins_allowed: maxRejoins,
        system_announcement: announcement,
      });
      setSettings(updated);
      setSuccessMessage('Platform configurations updated and synchronized successfully!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update configurations');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout title="Admin — Platform Configurations">
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBE5DC]">
          <div>
            <h2 className="text-xl font-bold font-serif text-stone-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-[#92400E]" />
              Proctoring & System Policy Configurations
            </h2>
            <p className="text-xs text-stone-600">
              Tune AI computer vision thresholds, lockdown constraints, and dynamic platform parameters in real-time.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchSettings}
            disabled={isLoading}
            className="gap-1.5 text-xs self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Reset to Server
          </Button>
        </div>

        {successMessage && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Card 1: AI Vision & Proctoring Settings */}
          <Card className="space-y-4 border border-[#EBE5DC]">
            <div className="flex items-center gap-2 pb-3 border-b border-[#EBE5DC]">
              <Eye className="w-4 h-4 text-[#C25E1A]" />
              <h3 className="text-sm font-bold font-serif text-stone-900">
                AI Vision & Biometric Sensitivity
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-stone-800">
                    ArcFace Similarity Threshold ({faceThreshold})
                  </label>
                  <span className="text-stone-500 font-mono text-[11px]">{faceThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.8"
                  step="0.05"
                  value={faceThreshold}
                  onChange={(e) => setFaceThreshold(parseFloat(e.target.value))}
                  className="w-full accent-[#C25E1A]"
                />
                <p className="text-[11px] text-stone-500">
                  Cosine similarity cutoff for identity match. 0.35 is the recommended balanced standard for ArcFace.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-stone-800">
                    Multiple Person Grace Period ({multiplePersonGrace}s)
                  </label>
                  <span className="text-stone-500 font-mono text-[11px]">{multiplePersonGrace}s</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={multiplePersonGrace}
                  onChange={(e) => setMultiplePersonGrace(parseFloat(e.target.value))}
                  className="w-full accent-[#C25E1A]"
                />
                <p className="text-[11px] text-stone-500">
                  Seconds multiple persons must persist in frame before triggering a confirmed violation alert.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-stone-800">
                    Looking Away / Gaze Shift Grace ({lookingAwayGrace}s)
                  </label>
                  <span className="text-stone-500 font-mono text-[11px]">{lookingAwayGrace}s</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={lookingAwayGrace}
                  onChange={(e) => setLookingAwayGrace(parseFloat(e.target.value))}
                  className="w-full accent-[#C25E1A]"
                />
                <p className="text-[11px] text-stone-500">
                  Allowed yaw/pitch deviation before LOOKING_AWAY flag is reported.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-stone-800">
                    Max Allowed Reconnects
                  </label>
                  <span className="text-stone-500 font-mono text-[11px]">{maxRejoins}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={maxRejoins}
                  onChange={(e) => setMaxRejoins(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-xl border border-[#EBE5DC] bg-white text-xs font-mono"
                />
                <p className="text-[11px] text-stone-500">
                  Default disconnect rejoin limit for candidates before requiring faculty re-admission.
                </p>
              </div>
            </div>
          </Card>

          {/* Card 2: Feature Toggles */}
          <Card className="space-y-4 border border-[#EBE5DC]">
            <div className="flex items-center gap-2 pb-3 border-b border-[#EBE5DC]">
              <Shield className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold font-serif text-stone-900">
                Advanced AI Modules & Lockdown Enforcement
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC] cursor-pointer hover:border-stone-400 transition-colors">
                <div>
                  <div className="font-semibold text-stone-900">Object Detection (Cell Phone, Book, Laptop)</div>
                  <div className="text-[11px] text-stone-500">
                    Runs lightweight NanoDet ONNX to flag unauthorized materials during examination.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={objectDetection}
                  onChange={(e) => setObjectDetection(e.target.checked)}
                  className="w-4 h-4 accent-[#C25E1A] rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC] cursor-pointer hover:border-stone-400 transition-colors">
                <div>
                  <div className="font-semibold text-stone-900">Audio Anomaly & Speech Detection</div>
                  <div className="text-[11px] text-stone-500">
                    Monitors audio activity for suspicious speech or background conversation.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={audioDetection}
                  onChange={(e) => setAudioDetection(e.target.checked)}
                  className="w-4 h-4 accent-[#C25E1A] rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF7F2] border border-[#EBE5DC] cursor-pointer hover:border-stone-400 transition-colors">
                <div>
                  <div className="font-semibold text-stone-900">Strict Fullscreen & Lockdown Enforcement</div>
                  <div className="text-[11px] text-stone-500">
                    Blocks copy/paste, tab switching, right clicks, and devtools across candidate workspaces.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={strictLockdown}
                  onChange={(e) => setStrictLockdown(e.target.checked)}
                  className="w-4 h-4 accent-[#C25E1A] rounded"
                />
              </label>
            </div>
          </Card>

          {/* Card 3: System Announcement */}
          <Card className="space-y-4 border border-[#EBE5DC]">
            <div className="flex items-center gap-2 pb-3 border-b border-[#EBE5DC]">
              <Volume2 className="w-4 h-4 text-[#1E5D88]" />
              <h3 className="text-sm font-bold font-serif text-stone-900">
                System Broadcast Announcement
              </h3>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-semibold text-stone-800">
                Banner Announcement Message (Optional)
              </label>
              <textarea
                rows={2}
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="e.g. Scheduled platform maintenance window tonight at 11:00 PM UTC."
                className="w-full px-3 py-2 rounded-xl border border-[#EBE5DC] bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#C25E1A]"
              />
              <p className="text-[11px] text-stone-500">
                Displayed as an active banner to all signed-in students and faculty when populated.
              </p>
            </div>
          </Card>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isSaving} className="gap-2">
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving Configurations...' : 'Save Configurations'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
