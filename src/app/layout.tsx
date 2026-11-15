import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Newsreader, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  style: ['normal', 'italic'],
});

const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mizan Care — Quiet, Private Wellbeing Support',
  description:
    'Check in with yourself privately, understand how mind and body connect, and reach trusted local care only when you choose.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${newsreader.variable} ${notoArabic.variable}`}
    >
      <body className="min-h-screen bg-[#F9F7F3] text-stone-900 font-sans antialiased selection:bg-teal-100 selection:text-teal-950">
        {children}
      </body>
    </html>
  );
}