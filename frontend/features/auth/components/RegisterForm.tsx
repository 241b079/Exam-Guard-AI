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
    <div className="w-full max-w-md p-8 md:p-10 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm-lg space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-[#FBECE0] border border-[#F6D6C0] text-[#C25E1A] mb-1">
          <UserPlus className="w-7 h-7" />
        </div>
        <h1 className="text-3xl font-serif font-bold text-stone-900 tracking-tight">Create Account</h1>
        <p className="text-sm text-stone-500">Join the Online Examination & Proctoring Platform</p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-700 text-sm">
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
        <div className="p-4 bg-[#FAF7F2] border border-[#EBE5DC] rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Development Mode: Select Role</span>
          </div>
          <Select
            label="Role"
            options={roleOptions}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          />
          <p className="text-[11px] text-stone-500 italic">
            Note: Role selection is enabled for testing during Phase 1.
          </p>
        </div>

        <Button type="submit" className="w-full mt-2" isLoading={isLoading} size="lg">
          Create Account
        </Button>
      </form>

      <div className="text-center text-xs text-stone-500 pt-4 border-t border-[#EBE5DC]">
        Already have an account?{' '}
        <Link href="/login" className="text-[#C25E1A] hover:text-[#A94F13] font-semibold transition-colors">
          Sign In
        </Link>
      </div>
    </div>
  );
};

