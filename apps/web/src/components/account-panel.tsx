'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser } from '@/lib/api';
import { roleLabel } from '@/lib/person';
import { PasswordField } from './password-field';
import styles from './portal.module.css';

export function AccountPanel() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ user: CurrentUser }>('/auth/me')
      .then((result) => setUser(result.user))
      .catch(() => router.replace('/acceso'));
  }, [router]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: data.get('currentPassword'),
          newPassword: data.get('newPassword'),
          passwordConfirmation: data.get('passwordConfirmation'),
        }),
      });
      setSuccess('Tu contraseña quedó actualizada. También cerramos tus otras sesiones.');
      form.reset();
      setUser((current) => (current ? { ...current, mustChangePassword: false } : current));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/acceso');
    router.refresh();
  }

  if (!user) return <div className={styles.loading}>Abriendo tu espacio…</div>;

  return (
    <div className={styles.card}>
      <div className={styles.profileHeader}>
        <span className={styles.avatar}>{user.fullName.slice(0, 1).toUpperCase()}</span>
        <div>
          <h2>{user.fullName}</h2>
          <p>
            {roleLabel(user)} · {user.phone ?? user.email}
          </p>
        </div>
      </div>
      {user.mustChangePassword ? (
        <div className={styles.notice}>
          Estás usando una contraseña temporal. Cámbiala antes de continuar con tu cuenta.
        </div>
      ) : null}
      <div className={styles.divider} />
      {!user.mustChangePassword ? (
        <div className={styles.accountNavigation}>
          <Link className={styles.accountNavCard} href="/mis-datos">
            <span>Mi perfil</span>
            <strong>Revisar mis datos</strong>
          </Link>
          <Link className={styles.accountNavCard} href="/notificaciones">
            <span>Avisos</span>
            <strong>Ver notificaciones</strong>
          </Link>
          {user.role === 'CLIENT' ? (
            <>
              <Link className={styles.accountNavCard} href="/catalogo">
                <span>Inspiración</span>
                <strong>Explorar diseños</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/cotizaciones">
                <span>Mis ideas</span>
                <strong>Ver cotizaciones</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/reservar">
                <span>Reservar</span>
                <strong>Encontrar mi próxima cita</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/agenda">
                <span>Mis citas</span>
                <strong>Ver y reprogramar</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/recompensas">
                <span>Mis beneficios</span>
                <strong>Ver visitas y cupones</strong>
              </Link>
            </>
          ) : (
            <>
              <Link className={styles.accountNavCard} href="/cotizaciones">
                <span>Solicitudes</span>
                <strong>Revisar cotizaciones</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/agenda">
                <span>Agenda</span>
                <strong>Gestionar citas</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/horarios">
                <span>Horarios</span>
                <strong>Configurar disponibilidad</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/recompensas/equipo">
                <span>Fidelidad</span>
                <strong>Consultar y canjear cupones</strong>
              </Link>
            </>
          )}
          {user.role === 'ADMIN' ? (
            <>
              <Link className={styles.accountNavCard} href="/administracion">
                <span>Resumen</span>
                <strong>Ver indicadores del estudio</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/administracion/reportes">
                <span>Reportes</span>
                <strong>Consultar y exportar datos</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/administracion/auditoria">
                <span>Auditoría</span>
                <strong>Revisar actividad del sistema</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/administracion/configuracion">
                <span>Estudio</span>
                <strong>Logo, contacto y ubicación</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/administracion/usuarios">
                <span>Equipo</span>
                <strong>Administrar personas</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/administracion/catalogo">
                <span>Contenido</span>
                <strong>Catálogo y calculadora</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/administracion/recompensas">
                <span>Beneficios</span>
                <strong>Reglas y promociones</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/administracion/anticipos">
                <span>Transferencias</span>
                <strong>Revisar anticipos</strong>
              </Link>
              <Link className={styles.accountNavCard} href="/administracion/notificaciones">
                <span>Comunicación</span>
                <strong>Plantillas y entregas</strong>
              </Link>
            </>
          ) : null}
          {user.role !== 'CLIENT' ? (
            <Link className={styles.accountNavCard} href="/integraciones">
              <span>Conexiones</span>
              <strong>
                {user.role === 'NAIL_TECHNICIAN' ? 'Google Calendar y avisos' : 'Estado de canales'}
              </strong>
            </Link>
          ) : null}
        </div>
      ) : null}
      {user.mustChangePassword ? <div className={styles.divider} /> : null}
      {user.mustChangePassword ? (
        <section className={styles.requiredSecurity}>
          <h2>Crea tu contraseña personal</h2>
          <p>La contraseña temporal solo sirve para el primer acceso.</p>
          <PasswordForm
            error={error}
            loading={loading}
            onLogout={logout}
            onSubmit={changePassword}
            success={success}
          />
        </section>
      ) : (
        <details className={styles.securityDetails}>
          <summary>
            <span>Seguridad</span>
            <strong>Contraseña y cierre de sesión</strong>
          </summary>
          <div className={styles.securityContent}>
            <PasswordForm
              error={error}
              loading={loading}
              onLogout={logout}
              onSubmit={changePassword}
              success={success}
            />
          </div>
        </details>
      )}
    </div>
  );
}

interface PasswordFormProps {
  error: string;
  loading: boolean;
  onLogout: () => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  success: string;
}

function PasswordForm({ error, loading, onLogout, onSubmit, success }: PasswordFormProps) {
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <PasswordField
        autoComplete="current-password"
        id="currentPassword"
        label="Contraseña actual"
        name="currentPassword"
        required
      />
      <div className={styles.gridTwo}>
        <PasswordField
          autoComplete="new-password"
          id="newPassword"
          label="Nueva contraseña"
          name="newPassword"
          required
        />
        <PasswordField
          autoComplete="new-password"
          id="passwordConfirmation"
          label="Confirmarla"
          name="passwordConfirmation"
          required
        />
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}
      <div className={styles.buttonRow}>
        <button className={styles.primaryButton} disabled={loading} type="submit">
          Guardar contraseña
        </button>
        <button className={styles.secondaryButton} onClick={onLogout} type="button">
          Cerrar sesión
        </button>
      </div>
    </form>
  );
}
