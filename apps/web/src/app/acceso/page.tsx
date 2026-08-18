import type { Metadata } from 'next';

import { LoginForm } from '@/components/login-form';
import { PortalShell } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default function AccessPage() {
  return (
    <PortalShell
      eyebrow="Tu espacio personal"
      title="Qué bonito tenerte de vuelta."
      intro="Entra para consultar tus citas, recompensas y solicitudes. El equipo puede usar correo o teléfono."
      aside={
        <>
          <h2>Una cuenta, toda tu historia</h2>
          <p>
            Tus visitas pertenecen a Dear Angel, sin importar con cuál manicurista hayas venido.
            Aquí podrás seguir cada beneficio desbloqueado.
          </p>
        </>
      }
    >
      <LoginForm />
    </PortalShell>
  );
}
