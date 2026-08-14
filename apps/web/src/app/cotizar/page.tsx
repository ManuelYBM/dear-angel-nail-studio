import type { Metadata } from 'next';

import { PortalShell } from '@/components/portal-shell';
import { QuoteBuilder } from '@/components/quote-builder';

export const metadata: Metadata = { title: 'Cotizar diseño' };

export default function QuotePage() {
  return (
    <PortalShell
      eyebrow="Diseño personalizado"
      title="Arma una idea tan tuya como tus manos."
      intro="Combina técnica, largo y detalles. Una manicurista revisará la estimación antes de que elijas horario."
      wide
    >
      <QuoteBuilder />
    </PortalShell>
  );
}
