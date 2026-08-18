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
  onUserChange?: (user: CurrentUser | null) => void;
}

function workspaceFor(user: CurrentUser) {
  if (user.role === 'ADMIN') {
    return { href: '/administracion', label: 'Resumen del estudio' };
  }
  if (user.role === 'NAIL_TECHNICIAN') {
    return { href: '/agenda', label: 'Mi agenda de trabajo' };
  }
  return { href: '/agenda', label: 'Mis citas' };
}

export function SessionIndicator({
  compact = false,
  hideWhenAnonymous = false,
  mobileOnlyWhenAnonymous = false,
  onUserChange,
}: SessionIndicatorProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    let active = true;
    const load = () => {
      void apiFetch<{ user: CurrentUser }>('/auth/me')
        .then(({ user: currentUser }) => {
          if (active) {
            setUser(currentUser);
            onUserChange?.(currentUser);
            setLogoutError('');
            if (currentUser.mustChangePassword) setUnreadCount(0);
            else {
              void apiFetch<{ count: number }>('/notifications/unread-count')
                .then(({ count }) => active && setUnreadCount(count))
                .catch(() => undefined);
            }
          }
        })
        .catch(() => {
          if (active) {
            setUser(null);
            onUserChange?.(null);
          }
        });
    };
    load();
    window.addEventListener('dearangel:session-changed', load);
    return () => {
      active = false;
      window.removeEventListener('dearangel:session-changed', load);
    };
  }, [onUserChange]);

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
    setLoggingOut(true);
    setLogoutError('');
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      setUser(null);
      setUnreadCount(0);
      onUserChange?.(null);
      window.dispatchEvent(new Event('dearangel:session-changed'));
      router.replace('/acceso');
      router.refresh();
    } catch (reason) {
      setLogoutError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos cerrar la sesión. Tu sesión sigue abierta.',
      );
    } finally {
      setLoggingOut(false);
    }
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
      <div
        className={`${styles.guestActions} ${mobileOnlyWhenAnonymous ? styles.homeMobileLogin : ''}`}
      >
        <Link className={`${styles.login} ${compact ? styles.compact : ''}`} href="/acceso">
          Iniciar sesión
        </Link>
        <Link className={`${styles.register} ${compact ? styles.compact : ''}`} href="/registro">
          Crear cuenta
        </Link>
      </div>
    );
  }

  const workspace = workspaceFor(user);

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
        {unreadCount ? (
          <span aria-label={`${unreadCount} notificaciones sin leer`} className={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
        <span aria-hidden="true" className={styles.chevron}>
          <svg fill="none" viewBox="0 0 20 20">
            <path d="m5.5 7.75 4.5 4.5 4.5-4.5" />
          </svg>
        </span>
      </summary>
      <div className={styles.popover}>
        <div className={styles.menuHeading}>
          <strong>{user.fullName}</strong>
          <span>{user.phone ?? user.email}</span>
        </div>
        <nav aria-label="Menú de cuenta y espacio de trabajo" className={styles.menuLinks}>
          {!user.mustChangePassword ? (
            <>
              <span className={styles.menuSection}>Espacio de trabajo</span>
              <Link className={styles.workspaceLink} href={workspace.href} onClick={closeMenu}>
                {workspace.label}
              </Link>
              <span className={styles.menuSection}>Cuenta</span>
              <Link href="/mi-cuenta" onClick={closeMenu}>
                Mi cuenta
              </Link>
              <Link href="/mis-datos" onClick={closeMenu}>
                Mis datos
              </Link>
              <Link href="/notificaciones" onClick={closeMenu}>
                Notificaciones {unreadCount ? `(${unreadCount})` : ''}
              </Link>
              {user.role !== 'CLIENT' ? (
                <>
                  <span className={styles.menuSection}>Sitio para clientas</span>
                  <Link href="/" onClick={closeMenu}>
                    Ver sitio público
                  </Link>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Link href="/mi-cuenta" onClick={closeMenu}>
                Mi cuenta
              </Link>
              <span className={styles.passwordNotice}>Cambia tu contraseña para continuar.</span>
            </>
          )}
        </nav>
        {logoutError ? (
          <span className={styles.logoutError} role="alert">
            {logoutError}
          </span>
        ) : null}
        <button className={styles.logout} disabled={loggingOut} onClick={logout} type="button">
          {loggingOut ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      </div>
    </details>
  );
}
