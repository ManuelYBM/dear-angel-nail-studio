import type { Metadata } from 'next';

import { PortalShell } from '@/components/portal-shell';
import { SchedulePanel } from '@/components/schedule-panel';

export const metadata: Metadata = { title: 'Horarios' };

export default function SchedulePage() {
  return (
    <PortalShell
      eyebrow="Disponibilidad"
      title="Una agenda que respeta tu ritmo."
      intro="Define tus horas, descansos y fechas especiales. Los cambios nunca borran citas existentes: te avisan para que decidas con calma."
      wide
    >
      <SchedulePanel />
    </PortalShell>
  );
}
