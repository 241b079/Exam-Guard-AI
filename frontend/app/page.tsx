import Link from 'next/link';
import { Shield, Lock, Eye, Video, FileText, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#FAF7F2] text-stone-800 flex flex-col selection:bg-[#C25E1A] selection:text-white">
      {/* Navbar */}
      <header className="border-b border-[#EBE5DC] bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#FBECE0] border border-[#F6D6C0] text-[#C25E1A]">
              <Shield className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold font-serif tracking-tight text-stone-900">ExamGuard AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-stone-700 hover:text-stone-900 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="px-5 py-2 text-sm font-medium rounded-full bg-[#C25E1A] hover:bg-[#A94F13] text-white shadow-sm transition-all"
            >
              Create Account
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-28 flex-1 flex flex-col justify-center">
        {/* Subtle warm glow effect */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#F6D6C0]/30 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="max-w-4xl mx-auto px-6 text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F5EFEB] border border-[#E3DCD2] text-[#8C3A0F] text-xs font-semibold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-[#C25E1A]" /> Next-Gen Proctoring Platform
          </div>

          <h1 className="text-4xl md:text-6xl font-serif text-stone-900 tracking-tight leading-[1.15]">
            Online Examination & <br />
            <span className="italic font-serif text-[#C25E1A]">
              Proctoring Platform
            </span>
          </h1>

          <p className="text-base md:text-lg text-stone-600 max-w-2xl mx-auto leading-relaxed">
            A comprehensive solution providing secure online examinations, automated role management, and intelligent AI proctoring for institutions and educators.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/register"
              className="w-full sm:w-auto px-7 py-3 rounded-full bg-[#C25E1A] hover:bg-[#A94F13] text-white font-medium text-sm shadow-sm flex items-center justify-center gap-2 transition-all hover:shadow"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto px-7 py-3 rounded-full bg-white hover:bg-[#FAF7F2] text-stone-800 border border-[#D6CEC4] font-medium text-sm flex items-center justify-center transition-all"
            >
              Sign In to Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Features Preview (Visual Placeholders for Phase 1) */}
      <section className="py-20 bg-white/60 border-t border-[#EBE5DC]">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-stone-900">Platform Capabilities</h2>
            <p className="text-stone-500 text-sm max-w-xl mx-auto">
              Visual preview of platform features. Functional integration arriving in Phase 2.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1 */}
            <div className="bg-white p-6 rounded-2xl space-y-4 border border-[#EBE5DC] shadow-warm hover:border-[#D0C5B5] transition-all">
              <div className="p-3 w-fit rounded-xl bg-[#FBECE0] text-[#C25E1A] border border-[#F6D6C0]">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Online Exams</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Structured test environments supporting automated grading, timed assessments, and dynamic question banks.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-white p-6 rounded-2xl space-y-4 border border-[#EBE5DC] shadow-warm hover:border-[#D0C5B5] transition-all">
              <div className="p-3 w-fit rounded-xl bg-[#F3E8FF] text-[#6B21A8] border border-[#E9D5FF]">
                <Eye className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">AI Proctoring</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Automated computer vision detection for face verification, gaze estimation, and anomaly detection.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white p-6 rounded-2xl space-y-4 border border-[#EBE5DC] shadow-warm hover:border-[#D0C5B5] transition-all">
              <div className="p-3 w-fit rounded-xl bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                <Video className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Real-Time Monitoring</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Live stream feeds and WebSocket event streams enabling proctors to monitor candidate activity live.
              </p>
            </div>

            {/* Card 4 */}
            <div className="bg-white p-6 rounded-2xl space-y-4 border border-[#EBE5DC] shadow-warm hover:border-[#D0C5B5] transition-all">
              <div className="p-3 w-fit rounded-xl bg-[#DEF7EC] text-[#03543F] border border-[#BCF0DA]">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900">Secure Authentication</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                PostgreSQL user storage, JWT tokens with Redis session state, and strict role-based access control.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#EBE5DC] py-8 text-center text-xs text-stone-500 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          ExamGuard AI — Online Exam Proctoring Platform © 2026. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

