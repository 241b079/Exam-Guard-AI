import Link from 'next/link';
import { Shield, Lock, Eye, Video, FileText, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col selection:bg-brand-500 selection:text-white">
      {/* Navbar */}
      <header className="border-b border-slate-800 glass-panel sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400">
              <Shield className="w-6 h-6" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">ExamGuard AI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-lg shadow-brand-500/20 transition-all"
            >
              Create Account
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 md:py-32 flex-1 flex flex-col justify-center">
        {/* Background glow effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-brand-500/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-4xl mx-auto px-6 text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold uppercase tracking-wider">
            <Shield className="w-4 h-4" /> Next-Gen Proctoring Platform
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight leading-tight">
            Online Examination & <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-400 via-brand-300 to-emerald-400">
              Proctoring Platform
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            A comprehensive solution providing secure online examinations, automated role management, and intelligent AI proctoring for institutions and educators.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/register"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold text-base shadow-xl shadow-brand-500/25 flex items-center justify-center gap-2 transition-all hover:scale-105"
            >
              Get Started <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-base flex items-center justify-center transition-all"
            >
              Sign In to Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Features Preview (Visual Placeholders for Phase 1) */}
      <section className="py-20 bg-slate-950/60 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-2xl md:text-3xl font-bold text-white">Platform Capabilities</h2>
            <p className="text-slate-400 text-sm max-w-xl mx-auto">
              Visual preview of platform features. Functional integration arriving in Phase 2.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1 */}
            <div className="glass-card p-6 rounded-2xl space-y-4 border border-slate-800 hover:border-slate-700 transition-all">
              <div className="p-3 w-fit rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Online Exams</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Structured test environments supporting automated grading, timed assessments, and dynamic question banks.
              </p>
            </div>

            {/* Card 2 */}
            <div className="glass-card p-6 rounded-2xl space-y-4 border border-slate-800 hover:border-slate-700 transition-all">
              <div className="p-3 w-fit rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Eye className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">AI Proctoring</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Automated computer vision detection for face verification, gaze estimation, and anomaly detection.
              </p>
            </div>

            {/* Card 3 */}
            <div className="glass-card p-6 rounded-2xl space-y-4 border border-slate-800 hover:border-slate-700 transition-all">
              <div className="p-3 w-fit rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Video className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Real-Time Monitoring</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Live stream feeds and WebSocket event streams enabling proctors to monitor candidate activity live.
              </p>
            </div>

            {/* Card 4 */}
            <div className="glass-card p-6 rounded-2xl space-y-4 border border-slate-800 hover:border-slate-700 transition-all">
              <div className="p-3 w-fit rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Secure Authentication</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                PostgreSQL user storage, JWT tokens with Redis session state, and strict role-based access control.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-6">
          ExamGuard AI — Online Exam Proctoring Platform © 2026. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
