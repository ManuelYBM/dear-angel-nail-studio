import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BookingPanel } from '@/components/booking-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Reservar cita' };

export default function BookingPage() {
  return (
    <PortalShell
      eyebrow="Agenda Dear Angel"
      title="Tu tiempo, a tu manera."
      intro="Consulta disponibilidad real, elige a tu manicurista y aparta una hora sin llamadas ni citas encimadas."
      wide
    >
      <Suspense fallback={null}>
        <BookingPanel />
      </Suspense>
    </PortalShell>
  );
}
