import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ExamGuard AI — Online Examination & Proctoring Platform',
  description: 'Secure online examinations and intelligent proctoring platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-[#FAF7F2] text-stone-800 antialiased min-h-screen selection:bg-[#C25E1A] selection:text-white">
        {children}
      </body>
    </html>
  );
}


