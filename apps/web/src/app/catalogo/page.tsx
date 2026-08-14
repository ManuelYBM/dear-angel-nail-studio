import type { Metadata } from 'next';

import { CatalogPanel } from '@/components/catalog-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Catálogo de diseños' };

export default function CatalogPage() {
  return (
    <PortalShell
      eyebrow="Inspiración Dear Angel"
      title="Encuentra tu próximo diseño."
      intro="Explora trabajos del estudio, guarda tus favoritos y reserva con el precio y tiempo definidos."
      wide
    >
      <CatalogPanel />
    </PortalShell>
  );
}
