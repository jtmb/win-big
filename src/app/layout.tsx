import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/contexts/AppContext';

export const metadata: Metadata = {
  title: 'WinBig — Lottery Number Predictor',
  description: 'AI-powered OLG lottery number prediction for Lotto 6/49 and Lotto Max',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <main
            style={{
              width: 800,
              height: 600,
              overflow: 'hidden',
              position: 'relative',
              background: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {children}
          </main>
        </AppProvider>
      </body>
    </html>
  );
}
