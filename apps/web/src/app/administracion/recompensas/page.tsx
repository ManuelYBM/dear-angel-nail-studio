import type { Metadata } from 'next';

import { AdminLoyaltyPanel } from '@/components/admin-loyalty-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Administrar recompensas' };

export default function AdminRewardsPage() {
  return (
    <PortalShell
      access="admin"
      eyebrow="Fidelidad Dear Angel"
      title="Diseña beneficios que sí se sienten personales."
      intro="Configura hitos, promociones y correcciones manteniendo un historial claro de cada movimiento."
      wide
    >
      <AdminLoyaltyPanel />
    </PortalShell>
  );
}
