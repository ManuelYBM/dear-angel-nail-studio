import type { Metadata } from 'next';

import { PortalShell } from '@/components/portal-shell';
import { StaffLoyaltyPanel } from '@/components/staff-loyalty-panel';

export const metadata: Metadata = { title: 'Recompensas de clientas' };

export default function StaffRewardsPage() {
  return (
    <PortalShell
      access="staff"
      eyebrow="Atención personalizada"
      title="Reconoce cada visita."
      intro="Consulta beneficios disponibles y registra el cupón que la clienta utilizó en el estudio."
      wide
    >
      <StaffLoyaltyPanel />
    </PortalShell>
  );
}
