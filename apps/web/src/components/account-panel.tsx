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
      window.dispatchEvent(new Event('dearangel:session-changed'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      window.dispatchEvent(new Event('dearangel:session-changed'));
      router.replace('/acceso');
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos cerrar la sesión. Tu sesión sigue abierta.',
      );
    } finally {
      setLoading(false);
    }
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
      {!user.mustChangePassword ? <div className={styles.divider} /> : null}
      {!user.mustChangePassword ? (
        <nav
          aria-label="Opciones de la cuenta"
          className={`${styles.accountNavigation} ${styles.personalNavigation}`}
        >
          <Link className={`${styles.accountNavCard} ${styles.personalNavCard}`} href="/mis-datos">
            <span>Datos personales</span>
            <strong>Revisar mi información</strong>
            <small>Nombre, contacto y preferencias de mi cuenta.</small>
          </Link>
          <Link
            className={`${styles.accountNavCard} ${styles.personalNavCard}`}
            href="/notificaciones"
          >
            <span>Avisos</span>
            <strong>Ver mis notificaciones</strong>
            <small>Novedades y mensajes relacionados con mi cuenta.</small>
          </Link>
        </nav>
      ) : null}
      <div className={styles.divider} />
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
        <section className={styles.accountSecurity} aria-labelledby="account-security-title">
          <div className={styles.accountSectionHeader}>
            <span>Seguridad</span>
            <h2 id="account-security-title">Contraseña y sesión</h2>
            <p>
              Actualiza tu contraseña o cierra la sesión de este dispositivo cuando lo necesites.
            </p>
          </div>
          <PasswordForm
            error={error}
            loading={loading}
            onLogout={logout}
            onSubmit={changePassword}
            success={success}
          />
        </section>
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
        <button
          className={styles.secondaryButton}
          disabled={loading}
          onClick={onLogout}
          type="button"
        >
          {loading ? 'Procesando…' : 'Cerrar sesión'}
        </button>
      </div>
    </form>
  );
}
