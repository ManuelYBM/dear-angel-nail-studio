'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { ChallengeResult } from '@/lib/api';
import styles from './portal.module.css';

type StoredChallenge = ChallengeResult & { phone: string };

export function VerifyPhoneForm() {
  const router = useRouter();
  const [challenge, setChallenge] = useState<StoredChallenge | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('da_verification');
    if (raw) setChallenge(JSON.parse(raw) as StoredChallenge);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setError('');
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch('/auth/verify-phone', {
        method: 'POST',
        body: JSON.stringify({ challengeId: challenge.challengeId, code: data.get('code') }),
      });
      sessionStorage.removeItem('da_verification');
      router.push('/mi-cuenta');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos verificar el código.');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!challenge) return;
    setError('');
    setLoading(true);
    try {
      const updated = await apiFetch<ChallengeResult>('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ phone: challenge.phone }),
      });
      const next = { ...updated, phone: challenge.phone };
      sessionStorage.setItem('da_verification', JSON.stringify(next));
      setChallenge(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos reenviar el código.');
    } finally {
      setLoading(false);
    }
  }

  if (!challenge) {
    return (
      <div className={styles.card}>
        <div className={styles.notice}>
          No encontramos una verificación pendiente en este navegador.
        </div>
        <div className={styles.divider} />
        <Link className={styles.textLink} href="/registro">
          Volver al registro
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.notice}>Código enviado a {challenge.destination}.</div>
        {challenge.debugCode ? (
          <div className={styles.mockCode}>
            Código de prueba para esta demostración:
            <strong>{challenge.debugCode}</strong>
          </div>
        ) : null}
        <div className={styles.field}>
          <label htmlFor="code">Código de seguridad</label>
          <input
            autoComplete="one-time-code"
            id="code"
            inputMode="numeric"
            maxLength={6}
            name="code"
            pattern="[0-9]{6}"
            placeholder="000000"
            required
          />
        </div>
        {error ? <div className={styles.error}>{error}</div> : null}
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
      </form>
    </div>
  );
}
