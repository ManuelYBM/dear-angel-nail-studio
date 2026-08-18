'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { ChallengeResult } from '@/lib/api';
import { PasswordField } from './password-field';
import { PhoneField } from './phone-field';
import styles from './portal.module.css';

export function RecoveryForm() {
  const [recovery, setRecovery] = useState<ChallengeResult | null>(null);
  const [acceptedWithoutChallenge, setAcceptedWithoutChallenge] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiFetch<{ accepted: true; recovery?: ChallengeResult }>(
        '/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ identifier: data.get('identifier') }),
        },
      );
      setRecovery(result.recovery ?? null);
      setAcceptedWithoutChallenge(!result.recovery);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos enviar el código.');
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recovery) return;
    setError('');
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: recovery.challengeId,
          code: data.get('code'),
          password: data.get('password'),
          passwordConfirmation: data.get('passwordConfirmation'),
        }),
      });
      setSuccess(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className={styles.card}>
        <div className={styles.success}>
          Tu contraseña quedó actualizada y las sesiones anteriores se cerraron.
        </div>
        <div className={styles.divider} />
        <Link className={styles.textLink} href="/acceso">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (recovery) {
    return (
      <div className={styles.card}>
        <form className={styles.form} onSubmit={resetPassword}>
          <div className={styles.notice}>Enviamos un código a {recovery.destination}.</div>
          {recovery.debugCode ? (
            <div className={styles.mockCode}>
              Código de depuración devuelto por el entorno local:
              <strong>{recovery.debugCode}</strong>
            </div>
          ) : null}
          <div className={styles.field}>
            <label htmlFor="code">Código</label>
            <input
              id="code"
              inputMode="numeric"
              maxLength={6}
              name="code"
              pattern="[0-9]{6}"
              required
            />
          </div>
          <div className={styles.gridTwo}>
            <PasswordField
              autoComplete="new-password"
              id="password"
              label="Nueva contraseña"
              name="password"
              required
            />
            <PasswordField
              autoComplete="new-password"
              id="passwordConfirmation"
              label="Confirmar contraseña"
              name="passwordConfirmation"
              required
            />
          </div>
          {error ? <div className={styles.error}>{error}</div> : null}
          <button className={styles.primaryButton} disabled={loading} type="submit">
            {loading ? 'Actualizando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <form className={styles.form} onSubmit={requestCode}>
        <PhoneField
          allowEmail
          autoComplete="username"
          id="identifier"
          label="Teléfono o correo"
          name="identifier"
          placeholder="999 123 4567 o correo@ejemplo.com"
          required
        />
        {acceptedWithoutChallenge ? (
          <div className={styles.notice}>
            Si existe un perfil con esos datos, recibirá las instrucciones de recuperación.
          </div>
        ) : null}
        {error ? <div className={styles.error}>{error}</div> : null}
        <button className={styles.primaryButton} disabled={loading} type="submit">
          {loading ? 'Buscando tu perfil…' : 'Enviar código'}
        </button>
        <Link className={styles.textLink} href="/acceso">
          Volver al acceso
        </Link>
      </form>
    </div>
  );
}
