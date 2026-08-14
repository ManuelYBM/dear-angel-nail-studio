import type { Metadata } from 'next';

import { AccountPanel } from '@/components/account-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Mi cuenta' };

export default function AccountPage() {
  return (
    <PortalShell
      eyebrow="Mi Dear Angel"
      title="Un espacio hecho para ti."
      intro="Desde aquí puedes entrar a tu agenda, reservar una cita o configurar la disponibilidad de trabajo según tu perfil."
    >
      <AccountPanel />
    </PortalShell>
  );
}
