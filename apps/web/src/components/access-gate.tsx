'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError, apiFetch, destinationForRole } from '@/lib/api';
import type { CurrentUser } from '@/lib/api';
import styles from './portal.module.css';

export type AccessLevel = 'authenticated' | 'client' | 'staff' | 'admin';

function hasAccess(user: CurrentUser, access: AccessLevel) {
  if (access === 'authenticated') return true;
  if (access === 'client') return user.role === 'CLIENT';
  if (access === 'staff') return user.role === 'ADMIN' || user.role === 'NAIL_TECHNICIAN';
  return user.role === 'ADMIN';
}

export function AccessGate({
  access,
  allowPasswordChange = false,
  children,
}: {
  access: AccessLevel;
  allowPasswordChange?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const checkAccess = useCallback(async () => {
    setReady(false);
    setError('');
    try {
      const { user } = await apiFetch<{ user: CurrentUser }>('/auth/me');
      if (user.mustChangePassword && !allowPasswordChange) {
        router.replace('/mi-cuenta');
        return;
      }
      if (!hasAccess(user, access)) {
        router.replace(destinationForRole(user.role));
        return;
      }
      setReady(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        router.replace('/acceso');
        return;
      }
      setError(reason instanceof Error ? reason.message : 'No pudimos comprobar tu acceso.');
    }
  }, [access, allowPasswordChange, router]);

  useEffect(() => {
    void checkAccess();

    const handleSessionChange = () => {
      void checkAccess();
    };
    window.addEventListener('dearangel:session-changed', handleSessionChange);
    return () => {
      window.removeEventListener('dearangel:session-changed', handleSessionChange);
    };
  }, [checkAccess]);

  if (error) {
    return (
      <div className={styles.card}>
        <div className={styles.error} role="alert">
          {error}
        </div>
        <button className={styles.secondaryButton} onClick={() => void checkAccess()} type="button">
          Volver a intentar
        </button>
      </div>
    );
  }
  if (!ready) return <div className={styles.loading}>Comprobando tu acceso…</div>;
  return children;
}
