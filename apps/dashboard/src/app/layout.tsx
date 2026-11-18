import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mintara AI — Enterprise D2C Operating System',
  description: 'AI-Powered Business Operations Platform for Mintara Bites (Surat, Gujarat)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#090d16] text-[#f8fafc] antialiased">
        {children}
      </body>
    </html>
  );
}
