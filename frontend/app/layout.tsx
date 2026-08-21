import type { Metadata } from 'next';
import { Newsreader, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

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
    <html lang="en" className={`${newsreader.variable} ${plusJakarta.variable}`}>
      <body className="font-sans bg-[#FAF7F2] text-stone-800 antialiased min-h-screen selection:bg-[#C25E1A] selection:text-white">
        {children}
      </body>
    </html>
  );
}

