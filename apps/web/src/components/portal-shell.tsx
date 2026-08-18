import type { ReactNode } from 'react';

import { AccessGate } from './access-gate';
import type { AccessLevel } from './access-gate';
import styles from './portal.module.css';

interface PortalShellProps {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  aside?: ReactNode;
  wide?: boolean;
  access?: AccessLevel;
  allowPasswordChange?: boolean;
}

export function PortalShell({
  eyebrow,
  title,
  intro,
  children,
  aside,
  wide,
  access,
  allowPasswordChange,
}: PortalShellProps) {
  return (
    <main className={styles.page} id="main-content">
      <div className={styles.glow} aria-hidden="true" />
      <section
        className={`${styles.layout} ${aside ? '' : styles.layoutSingle} ${wide ? styles.layoutWide : ''}`}
      >
        <div className={styles.content}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          {access ? (
            <AccessGate access={access} allowPasswordChange={allowPasswordChange}>
              {children}
            </AccessGate>
          ) : (
            children
          )}
        </div>
        {aside ? <aside className={styles.aside}>{aside}</aside> : null}
      </section>
    </main>
  );
}

export { styles as portalStyles };
