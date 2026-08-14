'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser } from '@/lib/api';

export function HomeHeroActions() {
  const [anonymous, setAnonymous] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    const loadSession = () => {
      void apiFetch<{ user: CurrentUser }>('/auth/me')
        .then(() => active && setAnonymous(false))
        .catch(() => active && setAnonymous(true));
    };

    loadSession();
    window.addEventListener('dearangel:session-changed', loadSession);
    return () => {
      active = false;
      window.removeEventListener('dearangel:session-changed', loadSession);
    };
  }, []);

  return (
    <div className="hero__actions">
      <Link className="button-link" href="/reservar">
        Reservar mi cita
      </Link>
      {anonymous ? (
        <Link className="button-link button-link--secondary" href="/registro">
          Crear mi cuenta
        </Link>
      ) : null}
    </div>
  );
}
