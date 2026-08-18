import type { Metadata } from 'next';

import { PortalShell } from '@/components/portal-shell';
import { ProfileDataPanel } from '@/components/profile-data-panel';

export const metadata: Metadata = { title: 'Mis datos' };

export default function ProfileDataPage() {
  return (
    <PortalShell
      access="authenticated"
      eyebrow="Mi perfil"
      title="Tus datos, siempre al día."
      intro="Actualiza la información con la que te identificamos y enviamos avisos. Confirmaremos los cambios sensibles antes de guardarlos."
    >
      <ProfileDataPanel />
    </PortalShell>
  );
}
