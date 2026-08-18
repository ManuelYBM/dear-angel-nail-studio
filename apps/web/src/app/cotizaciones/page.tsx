import type { Metadata } from 'next';

import { PortalShell } from '@/components/portal-shell';
import { QuotesPanel } from '@/components/quotes-panel';

export const metadata: Metadata = { title: 'Cotizaciones' };

export default function QuotesPage() {
  return (
    <PortalShell
      access="authenticated"
      eyebrow="Seguimiento"
      title="Cotizaciones claras, antes de reservar."
      intro="Revisa el avance de cada solicitud y, cuando esté aprobada, elige un horario con la manicurista responsable."
      wide
    >
      <QuotesPanel />
    </PortalShell>
  );
}
