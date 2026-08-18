import type { Metadata, Viewport } from 'next';

import { PwaBridge } from '@/components/pwa-bridge';
import { SiteHeader } from '@/components/site-header';
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
    icon: '/app-icon',
    apple: '/app-icon',
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
          <SiteHeader />
          {children}
          <PwaBridge />
        </StudioProvider>
      </body>
    </html>
  );
}
