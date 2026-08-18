'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser } from '@/lib/api';

export function HomeHeroActions() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    let active = true;

    const loadSession = () => {
      void apiFetch<{ user: CurrentUser }>('/auth/me')
        .then((result) => active && setUser(result.user))
        .catch(() => active && setUser(null));
    };

    loadSession();
    window.addEventListener('dearangel:session-changed', loadSession);
    return () => {
      active = false;
      window.removeEventListener('dearangel:session-changed', loadSession);
    };
  }, []);

  if (user === undefined) {
    return (
      <div aria-busy="true" aria-label="Preparando accesos" className="hero__actions">
        <span aria-hidden="true" className="button-link hero__action-placeholder">
          Abrir mi espacio
        </span>
        <span
          aria-hidden="true"
          className="button-link button-link--secondary hero__action-placeholder"
        >
          Ver diseños
        </span>
      </div>
    );
  }

  const primaryAction = user?.mustChangePassword
    ? { href: '/mi-cuenta', label: 'Cambiar mi contraseña' }
    : user?.role === 'ADMIN'
      ? { href: '/administracion', label: 'Ir al panel' }
      : user?.role === 'NAIL_TECHNICIAN'
        ? { href: '/agenda', label: 'Ver mi agenda' }
        : { href: '/reservar', label: 'Reservar mi cita' };

  const secondaryLabel = user?.role === 'ADMIN' ? 'Ver catálogo público' : 'Ver diseños';

  return (
    <div className="hero__actions">
      <Link className="button-link" href={primaryAction.href}>
        {primaryAction.label}
      </Link>
      {user?.mustChangePassword ? null : (
        <Link className="button-link button-link--secondary" href="/catalogo">
          {secondaryLabel}
        </Link>
      )}
    </div>
  );
}
