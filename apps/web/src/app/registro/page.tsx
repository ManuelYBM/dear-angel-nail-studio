import type { Metadata } from 'next';

import { PortalShell } from '@/components/portal-shell';
import { RegisterForm } from '@/components/register-form';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function RegisterPage() {
  return (
    <PortalShell
      eyebrow="Comienza tu camino"
      title="Tu próxima visita empieza aquí."
      intro="Solo necesitamos tus datos esenciales. Te enviaremos un código por WhatsApp para confirmar que el número es tuyo."
      aside={
        <>
          <h2>Antes de reservar</h2>
          <p>
            Si eres menor de 16 años, debes asistir con una persona adulta. Las personas adultas
            asisten sin niñas, niños ni acompañantes.
          </p>
          <p>Tu perfil se activa únicamente después de confirmar el código de WhatsApp.</p>
          <p>Tu contraseña se guarda cifrada y nunca puede ser consultada por el equipo.</p>
        </>
      }
    >
      <RegisterForm />
    </PortalShell>
  );
}
