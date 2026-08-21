import { RegisterForm } from '@/features/auth/components/RegisterForm';

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-4 selection:bg-[#C25E1A] selection:text-white">
      <RegisterForm />
    </div>
  );
}

