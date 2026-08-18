import type { Metadata } from 'next';

import { AppointmentsPanel } from '@/components/appointments-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Agenda' };

export default function AppointmentsPage() {
  return (
    <PortalShell
      access="authenticated"
      eyebrow="Agenda viva"
      title="Cada cita en su lugar."
      intro="Reservas, cambios y seguimiento en un solo espacio. La disponibilidad se protege incluso cuando dos personas intentan reservar al mismo tiempo."
      wide
    >
      <AppointmentsPanel />
    </PortalShell>
  );
}
