import type { Metadata } from 'next';

import { PoliciesPanel } from '@/components/policies-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Políticas de reservación' };

export default function PoliciesPage() {
  return (
    <PortalShell
      eyebrow="Antes de tu cita"
      title="Políticas de reservación."
      intro="Queremos que tu horario y el del equipo estén cuidados desde el primer momento."
    >
      <PoliciesPanel />
    </PortalShell>
  );
}
