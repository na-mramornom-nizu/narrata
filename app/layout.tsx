import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Narrata — AI-дашборды с нарративом',
  description: 'Загрузите сырые данные — получите историю.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="min-h-screen antialiased">
        <div className="aurora" />
        <div className="grid-overlay" />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}