'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { ChallengeResult } from '@/lib/api';
import {
  parseStoredVerificationChallenge,
  verificationChallengeForStorage,
} from '@/lib/verification-storage';
import type { StoredVerificationChallenge } from '@/lib/verification-storage';
import styles from './portal.module.css';

export function VerifyPhoneForm() {
  const router = useRouter();
  const [challenge, setChallenge] = useState<StoredVerificationChallenge | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationExpired, setRegistrationExpired] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('da_verification');
    if (!raw) return;
    const stored = parseStoredVerificationChallenge(raw);
    if (stored) {
      setChallenge(stored);
      sessionStorage.setItem('da_verification', JSON.stringify(stored));
    } else {
      sessionStorage.removeItem('da_verification');
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setError('');
    setRegistrationExpired(false);
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch('/auth/verify-phone', {
        method: 'POST',
        body: JSON.stringify({ challengeId: challenge.challengeId, code: data.get('code') }),
      });
      sessionStorage.removeItem('da_verification');
      window.dispatchEvent(new Event('dearangel:session-changed'));
      router.push('/mi-cuenta');
      router.refresh();
    } catch (reason) {
      const expired = reason instanceof ApiError && reason.code === 'REGISTRATION_EXPIRED';
      setRegistrationExpired(expired);
      if (expired) sessionStorage.removeItem('da_verification');
      setError(reason instanceof Error ? reason.message : 'No pudimos verificar el código.');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!challenge) return;
    setError('');
    setRegistrationExpired(false);
    setLoading(true);
    try {
      const updated = await apiFetch<ChallengeResult>('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ challengeId: challenge.challengeId }),
      });
      const next = verificationChallengeForStorage(updated);
      sessionStorage.setItem('da_verification', JSON.stringify(next));
      setChallenge(next);
    } catch (reason) {
      const expired = reason instanceof ApiError && reason.code === 'REGISTRATION_EXPIRED';
      setRegistrationExpired(expired);
      if (expired) sessionStorage.removeItem('da_verification');
      setError(reason instanceof Error ? reason.message : 'No pudimos reenviar el código.');
    } finally {
      setLoading(false);
    }
  }

  if (!challenge) {
    return (
      <div className={styles.card}>
        <div className={styles.notice}>
          No hay una verificación abierta en este navegador. Inicia sesión con los mismos datos; si
          tu registro está pendiente, podrás continuar desde aquí.
        </div>
        <div className={styles.divider} />
        <div className={styles.recoveryActions}>
          <Link className={styles.primaryLink} href="/acceso">
            Continuar desde inicio de sesión
          </Link>
          <Link className={styles.textLink} href="/registro">
            Crear una cuenta distinta
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.notice}>Código enviado a {challenge.destination}.</div>
        <div className={styles.field}>
          <label htmlFor="code">Código de seguridad</label>
          <input
            autoComplete="one-time-code"
            disabled={registrationExpired}
            id="code"
            inputMode="numeric"
            maxLength={6}
            name="code"
            pattern="[0-9]{6}"
            placeholder="000000"
            required
          />
        </div>
        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        {registrationExpired ? (
          <Link className={styles.secondaryActionLink} href="/registro">
            Crear mi cuenta de nuevo
          </Link>
        ) : (
          <>
            <button className={styles.primaryButton} disabled={loading} type="submit">
              {loading ? 'Verificando…' : 'Confirmar mi número'}
            </button>
            <button
              className={styles.secondaryButton}
              disabled={loading}
              onClick={resend}
              type="button"
            >
              Enviar otro código
            </button>
          </>
        )}
        <button
          className={styles.textLink}
          disabled={loading}
          onClick={() => {
            sessionStorage.removeItem('da_verification');
            router.push('/acceso');
          }}
          type="button"
        >
          Volver al inicio de sesión
        </button>
      </form>
    </div>
  );
}
