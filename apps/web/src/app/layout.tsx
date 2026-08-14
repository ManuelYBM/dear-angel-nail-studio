import type { Metadata, Viewport } from 'next';

import { PwaBridge } from '@/components/pwa-bridge';
import { StudioProvider } from '@/components/studio-brand';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Dear Angel Nail Studio',
    template: '%s | Dear Angel',
  },
  description: 'Una carta al autocuidado y la belleza.',
  applicationName: 'Dear Angel Nail Studio',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Dear Angel',
  },
  icons: {
    icon: '/brand/icon-placeholder.png',
    apple: '/brand/icon-placeholder.png',
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5d6dc',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <StudioProvider>
          {children}
          <PwaBridge />
        </StudioProvider>
      </body>
    </html>
  );
}
