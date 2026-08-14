import type { Metadata } from 'next';

import { PortalShell } from '@/components/portal-shell';
import { RecoveryForm } from '@/components/recovery-form';

export const metadata: Metadata = { title: 'Recuperar acceso' };

export default function RecoveryPage() {
  return (
    <PortalShell
      eyebrow="Recuperación segura"
      hideAnonymousSession
      title="Volvamos a abrir tu espacio."
      intro="Las clientas reciben el código por WhatsApp. La administradora y las manicuristas lo reciben por correo."
      aside={
        <>
          <h2>Tu contraseña es privada</h2>
          <p>
            Nadie en Dear Angel puede verla. La administradora puede ayudarte a iniciar este mismo
            proceso, pero solo tú estableces la nueva contraseña.
          </p>
        </>
      }
    >
      <RecoveryForm />
    </PortalShell>
  );
}
