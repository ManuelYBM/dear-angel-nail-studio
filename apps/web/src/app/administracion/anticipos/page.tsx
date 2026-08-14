import type { Metadata } from 'next';

import { AdminPaymentsPanel } from '@/components/admin-payments-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Administrar anticipos' };

export default function AdminPaymentsPage() {
  return (
    <PortalShell
      eyebrow="Reservas y transferencias"
      title="Anticipos bajo control."
      intro="Configura los datos SPEI y revisa cada comprobante antes de confirmar una cita."
      wide
    >
      <AdminPaymentsPanel />
    </PortalShell>
  );
}
