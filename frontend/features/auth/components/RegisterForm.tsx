'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { UserRole } from '@/types';
import { authService } from '../services/authService';

export const RegisterForm: React.FC = () => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('STUDENT');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Register user
      await authService.register({ name, email, password, role });
      // Auto-login upon successful registration
      const loginRes = await authService.login({ email, password });
      
      const userRole = loginRes.user.role;
      if (userRole === 'STUDENT') router.push('/student/dashboard');
      else if (userRole === 'FACULTY') router.push('/faculty/dashboard');
      else if (userRole === 'ADMIN') router.push('/admin/dashboard');
      else router.push('/login');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const roleOptions = [
    { label: 'Student', value: 'STUDENT' },
    { label: 'Faculty', value: 'FACULTY' },
    { label: 'Admin', value: 'ADMIN' },
  ];

  return (
    <div className="w-full max-w-md p-8 glass-panel rounded-2xl shadow-2xl space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400 mb-2">
          <UserPlus className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Create Account</h1>
        <p className="text-sm text-slate-400">Join the Online Examination & Proctoring Platform</p>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Full Name"
          type="text"
          placeholder="John Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <Input
          label="Email Address"
          type="email"
          placeholder="name@university.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          label="Password"
          type="password"
          placeholder="Minimum 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />

        {/* Development Role Selector */}
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Development Mode: Select Role</span>
          </div>
          <Select
            label="Role"
            options={roleOptions}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          />
          <p className="text-[11px] text-amber-300/80 italic">
            Note: Role selection is enabled for testing during Phase 1.
          </p>
        </div>

        <Button type="submit" className="w-full mt-2" isLoading={isLoading} size="lg">
          Create Account
        </Button>
      </form>

      <div className="text-center text-xs text-slate-400 pt-4 border-t border-slate-800">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-400 hover:text-brand-300 font-semibold transition-colors">
          Sign In
        </Link>
      </div>
    </div>
  );
};
