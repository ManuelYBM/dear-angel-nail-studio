'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser } from '@/lib/api';
import { roleLabel } from '@/lib/person';
import styles from './session-indicator.module.css';

interface SessionIndicatorProps {
  compact?: boolean;
  hideWhenAnonymous?: boolean;
  mobileOnlyWhenAnonymous?: boolean;
}

export function SessionIndicator({
  compact = false,
  hideWhenAnonymous = false,
  mobileOnlyWhenAnonymous = false,
}: SessionIndicatorProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      void apiFetch<{ user: CurrentUser }>('/auth/me')
        .then(({ user: currentUser }) => {
          if (active) {
            setUser(currentUser);
            void apiFetch<{ count: number }>('/notifications/unread-count')
              .then(({ count }) => active && setUnreadCount(count))
              .catch(() => undefined);
          }
        })
        .catch(() => {
          if (active) setUser(null);
        });
    };
    load();
    window.addEventListener('dearangel:session-changed', load);
    return () => {
      active = false;
      window.removeEventListener('dearangel:session-changed', load);
    };
  }, []);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        menuRef.current.open = false;
      }
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && menuRef.current) {
        menuRef.current.open = false;
        menuRef.current.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, []);

  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    router.replace('/acceso');
    router.refresh();
  }

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }

  if (user === undefined) {
    return <span aria-label="Consultando sesión" className={styles.loading} />;
  }

  if (!user) {
    if (hideWhenAnonymous) return null;
    return (
      <Link
        className={`${styles.login} ${compact ? styles.compact : ''} ${mobileOnlyWhenAnonymous ? styles.homeMobileLogin : ''}`}
        href="/acceso"
      >
        Iniciar sesión
      </Link>
    );
  }

  return (
    <details className={styles.menu} ref={menuRef}>
      <summary
        aria-label={`Abrir menú de ${user.fullName}`}
        className={`${styles.account} ${compact ? styles.compact : ''}`}
        title={`${user.fullName} · ${roleLabel(user)}`}
      >
        <span aria-hidden="true" className={styles.avatar}>
          {user.fullName.slice(0, 1).toUpperCase()}
        </span>
        <span className={styles.identity}>
          <strong>{user.fullName}</strong>
          <small>{roleLabel(user)}</small>
        </span>
        <span aria-hidden="true" className={styles.chevron}>
          ⌄
        </span>
        {unreadCount ? (
          <span aria-label={`${unreadCount} notificaciones sin leer`} className={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </summary>
      <div className={styles.popover}>
        <div className={styles.menuHeading}>
          <strong>{user.fullName}</strong>
          <span>{user.phone ?? user.email}</span>
        </div>
        <nav aria-label="Menú de cuenta" className={styles.menuLinks}>
          {user.role === 'ADMIN' ? (
            <Link href="/administracion" onClick={closeMenu}>
              Panel de administradora
            </Link>
          ) : null}
          <Link href="/mi-cuenta" onClick={closeMenu}>
            Mi cuenta
          </Link>
          <Link href="/agenda" onClick={closeMenu}>
            {user.role === 'CLIENT' ? 'Mis citas' : 'Agenda'}
          </Link>
          <Link href="/mis-datos" onClick={closeMenu}>
            Mis datos
          </Link>
          <Link href="/notificaciones" onClick={closeMenu}>
            Notificaciones {unreadCount ? `(${unreadCount})` : ''}
          </Link>
        </nav>
        <button className={styles.logout} onClick={logout} type="button">
          Cerrar sesión
        </button>
      </div>
    </details>
  );
}
