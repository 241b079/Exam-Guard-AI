'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, KeyRound, Mail, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authService } from '../services/authService';

export const LoginForm: React.FC = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await authService.login({ email, password });
      const role = res.user.role;
      
      if (role === 'STUDENT') router.push('/student/dashboard');
      else if (role === 'FACULTY') router.push('/faculty/dashboard');
      else if (role === 'ADMIN') router.push('/admin/dashboard');
      else router.push('/login');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 md:p-10 bg-white rounded-3xl border border-[#EBE5DC] shadow-warm-lg space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 rounded-full bg-[#FBECE0] border border-[#F6D6C0] text-[#C25E1A] mb-1">
          <Shield className="w-7 h-7" />
        </div>
        <h1 className="text-3xl font-serif font-bold text-stone-900 tracking-tight">Sign In</h1>
        <p className="text-sm text-stone-500">Enter your credentials to access your dashboard</p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Input
            label="Email Address"
            type="email"
            placeholder="name@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full mt-2" isLoading={isLoading} size="lg">
          Sign In
        </Button>
      </form>

      <div className="text-center text-xs text-stone-500 pt-4 border-t border-[#EBE5DC]">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-[#C25E1A] hover:text-[#A94F13] font-semibold transition-colors">
          Create Account
        </Link>
      </div>
    </div>
  );
};

