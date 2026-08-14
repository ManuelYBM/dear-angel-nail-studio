import Link from 'next/link';
import type { ReactNode } from 'react';

import { BackButton } from './back-button';
import { SessionIndicator } from './session-indicator';
import { StudioBrand } from './studio-brand';
import styles from './portal.module.css';

interface PortalShellProps {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  aside?: ReactNode;
  wide?: boolean;
  hideAnonymousSession?: boolean;
}

export function PortalShell({
  eyebrow,
  title,
  intro,
  children,
  aside,
  wide,
  hideAnonymousSession,
}: PortalShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.headerStart}>
          <BackButton />
          <StudioBrand portal />
        </div>
        <SessionIndicator hideWhenAnonymous={hideAnonymousSession} />
        <nav className={styles.mobilePortalNavigation} aria-label="Accesos rápidos">
          <Link href="/catalogo">Diseños</Link>
          <Link href="/reservar">Reservar</Link>
          <Link href="/politicas">Políticas</Link>
        </nav>
      </header>

      <section className={`${styles.layout} ${wide ? styles.layoutWide : ''}`}>
        <div className={styles.content}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          {children}
        </div>
        {aside ? <aside className={styles.aside}>{aside}</aside> : null}
      </section>
    </main>
  );
}

export { styles as portalStyles };
