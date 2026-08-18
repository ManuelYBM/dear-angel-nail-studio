import type { Metadata } from 'next';

import { MyLoyaltyPanel } from '@/components/my-loyalty-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Mis recompensas' };

export default function RewardsPage() {
  return (
    <PortalShell
      access="client"
      eyebrow="Camino Dear Angel"
      title="Cada visita deja algo para ti."
      intro="Consulta tu progreso, tus beneficios disponibles y el historial de los que ya disfrutaste."
      wide
    >
      <MyLoyaltyPanel />
    </PortalShell>
  );
}
