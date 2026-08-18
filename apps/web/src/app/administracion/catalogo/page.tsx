import type { Metadata } from 'next';

import { AdminCatalogPanel } from '@/components/admin-catalog-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Administrar catálogo' };
export default function AdminCatalogPage() {
  return (
    <PortalShell
      access="admin"
      eyebrow="Panel de la administradora"
      title="Catálogo y precios bajo tu control."
      intro="Publica trabajos, cambia precios, tiempos y opciones de la calculadora sin modificar código."
      wide
    >
      <AdminCatalogPanel />
    </PortalShell>
  );
}
