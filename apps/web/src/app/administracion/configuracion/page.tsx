import type { Metadata } from 'next';

import { PortalShell } from '@/components/portal-shell';
import { StudioSettingsPanel } from '@/components/studio-settings-panel';

export const metadata: Metadata = { title: 'Información del estudio' };

export default function StudioSettingsPage() {
  return (
    <PortalShell
      access="admin"
      eyebrow="Panel de la administradora"
      title="La identidad de Dear Angel."
      intro="Actualiza el logo, icono, ubicación y medios de contacto sin tocar el código."
      wide
    >
      <StudioSettingsPanel />
    </PortalShell>
  );
}
