'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CurrentUser, UserRole } from '@/lib/api';
import { BackButton } from './back-button';
import { SessionIndicator } from './session-indicator';
import { StudioBrand } from './studio-brand';
import styles from './site-header.module.css';

const AUTH_ROUTES = new Set(['/acceso', '/recuperar', '/registro', '/verificar']);

interface NavigationItem {
  href: string;
  label: string;
  active: (pathname: string) => boolean;
  mobileHidden?: boolean;
  mobileOnly?: boolean;
}

interface AdminNavigationGroup {
  label: string;
  items: NavigationItem[];
}

const exact = (href: string) => (pathname: string) => pathname === href;
const within = (href: string) => (pathname: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

const PUBLIC_NAVIGATION: NavigationItem[] = [
  { href: '/', label: 'Inicio', active: exact('/') },
  { href: '/#experiencia', label: 'Experiencia', active: () => false },
  {
    href: '/catalogo',
    label: 'Diseños',
    active: (pathname) => pathname === '/catalogo' || pathname.startsWith('/cotiza'),
  },
  {
    href: '/reservar',
    label: 'Reservar',
    active: (pathname) => pathname === '/reservar' || pathname === '/anticipo',
  },
  { href: '/politicas', label: 'Políticas', active: exact('/politicas') },
];

const CLIENT_NAVIGATION: NavigationItem[] = [
  { href: '/', label: 'Inicio', active: exact('/') },
  {
    href: '/catalogo',
    label: 'Diseños',
    active: (pathname) => pathname === '/catalogo' || pathname.startsWith('/cotiza'),
  },
  {
    href: '/reservar',
    label: 'Reservar',
    active: (pathname) => pathname === '/reservar' || pathname === '/anticipo',
  },
  { href: '/agenda', label: 'Mis citas', active: exact('/agenda') },
];

const TECHNICIAN_NAVIGATION: NavigationItem[] = [
  { href: '/agenda', label: 'Agenda', active: exact('/agenda') },
  { href: '/cotizaciones', label: 'Cotizaciones', active: within('/cotizaciones') },
  { href: '/horarios', label: 'Horarios', active: within('/horarios') },
  {
    href: '/recompensas/equipo',
    label: 'Fidelidad',
    active: within('/recompensas/equipo'),
  },
  { href: '/integraciones', label: 'Conexiones', active: within('/integraciones') },
];

const ADMIN_NAVIGATION: NavigationItem[] = [
  { href: '/administracion', label: 'Resumen', active: exact('/administracion') },
  { href: '/agenda', label: 'Agenda', active: exact('/agenda') },
  { href: '/cotizaciones', label: 'Cotizaciones', active: within('/cotizaciones') },
  {
    href: '/administracion/anticipos',
    label: 'Anticipos',
    active: within('/administracion/anticipos'),
    mobileHidden: true,
  },
];

const ADMIN_GROUPS: AdminNavigationGroup[] = [
  {
    label: 'Gestión',
    items: [
      {
        href: '/administracion/anticipos',
        label: 'Anticipos',
        active: within('/administracion/anticipos'),
        mobileOnly: true,
      },
      {
        href: '/administracion/usuarios',
        label: 'Equipo',
        active: within('/administracion/usuarios'),
      },
      {
        href: '/administracion/catalogo',
        label: 'Catálogo',
        active: within('/administracion/catalogo'),
      },
      { href: '/horarios', label: 'Horarios', active: within('/horarios') },
      {
        href: '/administracion/recompensas',
        label: 'Recompensas',
        active: within('/administracion/recompensas'),
      },
    ],
  },
  {
    label: 'Comunicación',
    items: [
      {
        href: '/administracion/notificaciones',
        label: 'Plantillas y entregas',
        active: within('/administracion/notificaciones'),
      },
      {
        href: '/integraciones',
        label: 'Integraciones',
        active: within('/integraciones'),
      },
    ],
  },
  {
    label: 'Control',
    items: [
      {
        href: '/administracion/reportes',
        label: 'Reportes',
        active: within('/administracion/reportes'),
      },
      {
        href: '/administracion/auditoria',
        label: 'Auditoría',
        active: within('/administracion/auditoria'),
      },
      {
        href: '/administracion/configuracion',
        label: 'Estudio',
        active: within('/administracion/configuracion'),
      },
    ],
  },
];

function navigationForRole(role?: UserRole): NavigationItem[] {
  if (role === 'ADMIN') return ADMIN_NAVIGATION;
  if (role === 'NAIL_TECHNICIAN') return TECHNICIAN_NAVIGATION;
  if (role === 'CLIENT') return CLIENT_NAVIGATION;
  return PUBLIC_NAVIGATION;
}

export function SiteHeader() {
  const pathname = usePathname();
  const adminMenuRef = useRef<HTMLDetailsElement>(null);
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  const handleSessionChange = useCallback((currentUser: CurrentUser | null) => {
    setUser(currentUser);
  }, []);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target as Node)) {
        adminMenuRef.current.open = false;
      }
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && adminMenuRef.current?.open) {
        adminMenuRef.current.open = false;
        adminMenuRef.current.querySelector('summary')?.focus();
      }
    }

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, []);

  useEffect(() => {
    if (adminMenuRef.current) adminMenuRef.current.open = false;
  }, [pathname]);

  const navigation = user === undefined ? [] : navigationForRole(user?.role);
  const isAdmin = user?.role === 'ADMIN';
  const isStaff = isAdmin || user?.role === 'NAIL_TECHNICIAN';
  const brandHref =
    user === undefined ? pathname : isAdmin ? '/administracion' : isStaff ? '/agenda' : '/';
  const showBackButton =
    pathname !== '/' && user !== undefined && (user === null || user.role === 'CLIENT');
  const adminMenuActive = ADMIN_GROUPS.some((group) =>
    group.items.some((item) => !item.mobileOnly && item.active(pathname)),
  );
  const adminMenuMobileActive = ADMIN_GROUPS.some((group) =>
    group.items.some((item) => item.mobileOnly && item.active(pathname)),
  );

  function closeAdminMenu() {
    if (adminMenuRef.current) adminMenuRef.current.open = false;
  }

  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Saltar al contenido
      </a>
      <header className={styles.header}>
        <div className={styles.inner}>
          <div className={styles.brandGroup}>
            {showBackButton ? <BackButton /> : null}
            <StudioBrand href={brandHref} portal />
            {isStaff ? (
              <span className={styles.workspaceLabel}>
                {isAdmin ? 'Administración' : 'Mi jornada'}
              </span>
            ) : null}
          </div>

          <nav
            aria-busy={user === undefined}
            aria-label={isStaff ? 'Navegación del espacio de trabajo' : 'Navegación principal'}
            className={`${styles.navigation} ${user === undefined ? styles.navigationLoading : ''}`}
          >
            {navigation.map((item) => {
              const current = item.active(pathname);
              return (
                <Link
                  aria-current={current ? 'page' : undefined}
                  className={`${styles.link} ${item.mobileHidden ? styles.mobileHidden : ''} ${current ? styles.active : ''}`}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}

            {isAdmin ? (
              <details className={styles.adminMenu} ref={adminMenuRef}>
                <summary
                  className={`${styles.link} ${styles.adminTrigger} ${adminMenuActive ? styles.active : ''} ${adminMenuMobileActive ? styles.adminTriggerMobileActive : ''}`}
                >
                  <span>Administrar</span>
                  <span aria-hidden="true" className={styles.adminChevron}>
                    <svg fill="none" viewBox="0 0 20 20">
                      <path d="m5.5 7.75 4.5 4.5 4.5-4.5" />
                    </svg>
                  </span>
                </summary>
                <div className={styles.adminPanel}>
                  {ADMIN_GROUPS.map((group) => (
                    <section className={styles.adminGroup} key={group.label}>
                      <span>{group.label}</span>
                      {group.items.map((item) => {
                        const current = item.active(pathname);
                        return (
                          <Link
                            aria-current={current ? 'page' : undefined}
                            className={`${item.mobileOnly ? styles.adminItemMobileOnly : ''} ${current ? styles.adminItemActive : ''}`}
                            href={item.href}
                            key={item.href}
                            onClick={closeAdminMenu}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </section>
                  ))}
                </div>
              </details>
            ) : null}
          </nav>

          <noscript>
            <nav aria-label="Navegación principal" className={styles.noScriptNavigation}>
              {PUBLIC_NAVIGATION.map((item) => (
                <Link href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </noscript>

          <div className={styles.session}>
            <SessionIndicator
              hideWhenAnonymous={AUTH_ROUTES.has(pathname)}
              onUserChange={handleSessionChange}
            />
          </div>
        </div>
      </header>
    </>
  );
}
