import type { Metadata } from 'next';

import { NotificationsPanel } from '@/components/notifications-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Notificaciones' };

export default function NotificationsPage() {
  return (
    <PortalShell
      access="authenticated"
      eyebrow="Al día"
      title="Tus notificaciones."
      intro="Confirmaciones, cambios, recordatorios y beneficios reunidos en un solo lugar."
    >
      <NotificationsPanel />
    </PortalShell>
  );
}
