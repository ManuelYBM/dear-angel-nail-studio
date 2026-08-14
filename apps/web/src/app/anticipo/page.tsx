import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PaymentPanel } from '@/components/payment-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Anticipo de reservación' };

export default function PaymentPage() {
  return (
    <PortalShell
      eyebrow="Reserva protegida"
      title="Confirma tu momento."
      intro="Realiza la transferencia con tu referencia y envía el comprobante para conservar el horario."
      wide
    >
      <Suspense fallback={null}>
        <PaymentPanel />
      </Suspense>
    </PortalShell>
  );
}
