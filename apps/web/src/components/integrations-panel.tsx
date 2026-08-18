'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser } from '@/lib/api';
import styles from './portal.module.css';

interface IntegrationStatus {
  whatsapp: { mode: 'real' | 'testing' | 'development' | 'unavailable'; configured: boolean };
  email: { mode: 'real' | 'development' | 'unavailable'; configured: boolean };
  googleCalendar: { enabled: boolean; configured: boolean };
}

interface CalendarStatus {
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export function IntegrationsPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const googleResult = searchParams.get('google');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [calendar, setCalendar] = useState<CalendarStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ user: CurrentUser }>('/auth/me'),
      apiFetch<IntegrationStatus>('/integrations/status'),
    ])
      .then(async ([{ user }, integrations]) => {
        setUser(user);
        setStatus(integrations);
        if (user.role === 'NAIL_TECHNICIAN') {
          setCalendar(await apiFetch<CalendarStatus>('/integrations/google-calendar/status'));
        }
      })
      .catch(() => router.replace('/acceso'));
  }, [router]);

  async function connectCalendar() {
    setError('');
    try {
      const { url } = await apiFetch<{ url: string }>('/integrations/google-calendar/connect');
      window.location.assign(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos abrir Google Calendar.');
    }
  }

  async function disconnectCalendar() {
    setError('');
    try {
      await apiFetch('/integrations/google-calendar', { method: 'DELETE' });
      setCalendar((current) =>
        current
          ? { ...current, connected: false, connectedAt: null, lastSyncAt: null, lastError: null }
          : current,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos desconectar el calendario.');
    }
  }

  if (!user || !status) return <div className={styles.loading}>Consultando conexiones…</div>;

  const modeLabel = (
    mode: 'real' | 'testing' | 'development' | 'unavailable',
    realLabel: string,
  ) => {
    if (mode === 'real') return realLabel;
    if (mode === 'testing') return 'Entrega real de prueba habilitada';
    if (mode === 'development') return 'Simulación local habilitada';
    return 'Canal no disponible';
  };

  return (
    <div className={styles.card}>
      <div className={styles.accountNavigation}>
        <article className={styles.accountNavCard}>
          <span>WhatsApp</span>
          <strong>{modeLabel(status.whatsapp.mode, 'Proveedor real configurado')}</strong>
        </article>
        <article className={styles.accountNavCard}>
          <span>Correo del personal</span>
          <strong>{modeLabel(status.email.mode, 'Proveedor real configurado')}</strong>
        </article>
      </div>
      {user.role === 'NAIL_TECHNICIAN' ? (
        <>
          <div className={styles.divider} />
          <section>
            <h2>Google Calendar</h2>
            {googleResult === 'connected' ? (
              <div className={styles.success} role="status">
                Google Calendar quedó conectado. Las citas confirmadas se sincronizarán aquí.
              </div>
            ) : googleResult === 'denied' ? (
              <div className={styles.notice} role="status">
                Cancelaste la autorización. No hicimos cambios en tu calendario.
              </div>
            ) : googleResult === 'error' ? (
              <div className={styles.error} role="alert">
                Google no completó la conexión. Vuelve a intentarlo o revisa la configuración.
              </div>
            ) : null}
            <p className={styles.intro}>
              {calendar?.connected
                ? 'Tus citas confirmadas se mantienen sincronizadas desde Dear Angel.'
                : 'Conecta tu calendario para recibir automáticamente las citas confirmadas.'}
            </p>
            {calendar?.lastSyncAt ? (
              <p className={styles.fieldHint}>
                Última sincronización: {new Date(calendar.lastSyncAt).toLocaleString('es-MX')}
              </p>
            ) : null}
            {calendar?.lastError ? <div className={styles.error}>{calendar.lastError}</div> : null}
            {error ? <div className={styles.error}>{error}</div> : null}
            <button
              className={calendar?.connected ? styles.secondaryButton : styles.primaryButton}
              onClick={calendar?.connected ? disconnectCalendar : connectCalendar}
              type="button"
            >
              {calendar?.connected ? 'Desconectar Google Calendar' : 'Conectar Google Calendar'}
            </button>
          </section>
        </>
      ) : null}
      {user.role === 'ADMIN' ? (
        <div className={styles.notice}>
          Las claves y plantillas se activan desde el entorno del servidor; nunca se muestran ni se
          guardan en esta pantalla.
        </div>
      ) : null}
    </div>
  );
}
