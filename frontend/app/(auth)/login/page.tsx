import { LoginForm } from '@/features/auth/components/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-4 selection:bg-[#C25E1A] selection:text-white">
      <LoginForm />
    </div>
  );
}

