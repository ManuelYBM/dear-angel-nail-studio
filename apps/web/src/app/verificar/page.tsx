import type { Metadata } from 'next';

import { PortalShell } from '@/components/portal-shell';
import { VerifyPhoneForm } from '@/components/verify-phone-form';

export const metadata: Metadata = { title: 'Verificar WhatsApp' };

export default function VerifyPage() {
  return (
    <PortalShell
      eyebrow="Un último detalle"
      hideAnonymousSession
      title="Confirma tu WhatsApp."
      intro="Escribe el código de seis dígitos que enviamos a tu número. Caduca en diez minutos."
      aside={
        <>
          <h2>¿Por qué lo verificamos?</h2>
          <p>
            Este número será tu acceso y el medio para recibir confirmaciones, cambios y
            recordatorios de tus citas.
          </p>
        </>
      }
    >
      <VerifyPhoneForm />
    </PortalShell>
  );
}
