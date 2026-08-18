import type { Metadata } from 'next';
import { Suspense } from 'react';

import { IntegrationsPanel } from '@/components/integrations-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Conexiones' };

export default function IntegrationsPage() {
  return (
    <PortalShell
      access="staff"
      eyebrow="Conexiones"
      title="Tus avisos, conectados."
      intro="Consulta los canales disponibles y administra tu calendario de trabajo."
    >
      <Suspense fallback={null}>
        <IntegrationsPanel />
      </Suspense>
    </PortalShell>
  );
}
