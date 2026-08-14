import type { Metadata } from 'next';

import { AdminDashboardPanel } from '@/components/admin-dashboard-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Resumen administrativo' };

export default function AdminDashboardPage() {
  return (
    <PortalShell
      eyebrow="Panel de la administradora"
      title="Tu estudio, de un vistazo."
      intro="Consulta la agenda, anticipos y comportamiento de la clientela con los datos del periodo que elijas."
      wide
    >
      <AdminDashboardPanel />
    </PortalShell>
  );
}
