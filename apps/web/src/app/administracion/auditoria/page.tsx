import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AdminAuditPanel } from '@/components/admin-audit-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Auditoría' };

export default function AdminAuditPage() {
  return (
    <PortalShell
      access="admin"
      eyebrow="Panel de la administradora"
      title="Historial de actividad."
      intro="Consulta cambios sensibles, responsables y fechas sin alterar los registros originales."
      wide
    >
      <Suspense fallback={null}>
        <AdminAuditPanel />
      </Suspense>
    </PortalShell>
  );
}
