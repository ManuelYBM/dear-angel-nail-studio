import type { Metadata } from 'next';

import { AccountPanel } from '@/components/account-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Mi cuenta' };

export default function AccountPage() {
  return (
    <PortalShell
      access="authenticated"
      allowPasswordChange
      eyebrow="Cuenta personal"
      title="Tu información, en un solo lugar."
      intro="Consulta tus datos, revisa tus avisos y administra la seguridad de tu cuenta."
    >
      <AccountPanel />
    </PortalShell>
  );
}
