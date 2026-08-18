import type { Metadata } from 'next';

import { AdminNotificationsPanel } from '@/components/admin-notifications-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Administrar notificaciones' };

export default function AdminNotificationsPage() {
  return (
    <PortalShell
      access="admin"
      eyebrow="Administración"
      title="Avisos con tu voz."
      intro="Ajusta los textos, vincula las plantillas aprobadas de WhatsApp y consulta cualquier entrega que esté reintentando."
      wide
    >
      <AdminNotificationsPanel />
    </PortalShell>
  );
}
