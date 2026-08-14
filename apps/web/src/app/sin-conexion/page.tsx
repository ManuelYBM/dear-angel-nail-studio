import type { Metadata } from 'next';
import Link from 'next/link';

import { PortalShell, portalStyles } from '@/components/portal-shell';

export const metadata: Metadata = { title: 'Sin conexión' };

export default function OfflinePage() {
  return (
    <PortalShell
      eyebrow="Conexión interrumpida"
      title="Volvemos en cuanto regrese tu internet."
      intro="Por seguridad, las citas, pagos y cambios de cuenta necesitan conexión para confirmarse."
    >
      <div className={portalStyles.card}>
        <h2>Tus datos siguen protegidos</h2>
        <p>Reconéctate y vuelve a intentar; ninguna acción incompleta se marcará como realizada.</p>
        <Link className={portalStyles.primaryButton} href="/">
          Intentar de nuevo
        </Link>
      </div>
    </PortalShell>
  );
}
