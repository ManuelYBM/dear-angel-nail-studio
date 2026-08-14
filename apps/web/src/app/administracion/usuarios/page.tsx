import type { Metadata } from 'next';

import { AdminUsersPanel } from '@/components/admin-users-panel';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Administración de usuarios' };

export default function AdminUsersPage() {
  return (
    <PortalShell
      eyebrow="Panel de la administradora"
      title="Personas que hacen Dear Angel."
      intro="Crea perfiles, administra accesos y ayuda a recuperar cuentas sin conocer ni mostrar ninguna contraseña."
      wide
    >
      <AdminUsersPanel />
    </PortalShell>
  );
}
