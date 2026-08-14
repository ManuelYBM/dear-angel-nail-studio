import type { Metadata } from 'next';

import { AdminReportsPanel } from '@/components/admin-reports-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Reportes' };

export default function AdminReportsPage() {
  return (
    <PortalShell
      eyebrow="Panel de la administradora"
      title="Reportes que sí puedes usar."
      intro="Filtra la operación por fechas y descarga la misma información en CSV o Excel."
      wide
    >
      <AdminReportsPanel />
    </PortalShell>
  );
}
