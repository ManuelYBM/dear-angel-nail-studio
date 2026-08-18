'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { ApiError, apiFetch, destinationForRole } from '@/lib/api';
import type { ChallengeResult, CurrentUser } from '@/lib/api';
import { verificationChallengeForStorage } from '@/lib/verification-storage';
import { PasswordField } from './password-field';
import { PhoneField } from './phone-field';
import styles from './portal.module.css';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationExpired, setRegistrationExpired] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setRegistrationExpired(false);
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiFetch<
        | { user: CurrentUser; verificationRequired?: false }
        | { verificationRequired: true; verification: ChallengeResult }
      >('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: data.get('identifier'),
          password: data.get('password'),
        }),
      });
      if (result.verificationRequired) {
        sessionStorage.setItem(
          'da_verification',
          JSON.stringify(verificationChallengeForStorage(result.verification)),
        );
        router.push('/verificar');
        return;
      }
      sessionStorage.removeItem('da_verification');
      window.dispatchEvent(new Event('dearangel:session-changed'));
      router.push(
        result.user.mustChangePassword ? '/mi-cuenta' : destinationForRole(result.user.role),
      );
      router.refresh();
    } catch (reason) {
      const expired = reason instanceof ApiError && reason.code === 'REGISTRATION_EXPIRED';
      setRegistrationExpired(expired);
      if (expired) sessionStorage.removeItem('da_verification');
      setError(reason instanceof Error ? reason.message : 'No pudimos iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.card}>
      <form className={styles.form} onSubmit={submit}>
        <PhoneField
          allowEmail
          autoComplete="username"
          id="identifier"
          label="Teléfono o correo"
          name="identifier"
          placeholder="999 123 4567 o correo@ejemplo.com"
          required
        />
        <PasswordField
          autoComplete="current-password"
          id="password"
          label="Contraseña"
          name="password"
          required
        />
        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        {registrationExpired ? (
          <Link className={styles.secondaryActionLink} href="/registro">
            Crear mi cuenta de nuevo
          </Link>
        ) : null}
        <button className={styles.primaryButton} disabled={loading} type="submit">
          {loading ? 'Entrando…' : 'Entrar a Dear Angel'}
        </button>
        <div className={styles.formFooter}>
          <Link className={styles.textLink} href="/registro">
            Crear cuenta
          </Link>
          <Link className={styles.textLink} href="/recuperar">
            Olvidé mi contraseña
          </Link>
        </div>
        <p className={styles.centeredHint}>
          Si saliste antes de verificar, entra con el mismo teléfono y contraseña para retomar la
          confirmación.
        </p>
      </form>
    </div>
  );
}
