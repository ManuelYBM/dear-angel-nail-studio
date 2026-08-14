'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch, destinationForRole } from '@/lib/api';
import type { CurrentUser } from '@/lib/api';
import { PasswordField } from './password-field';
import styles from './portal.module.css';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiFetch<{ user: CurrentUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: data.get('identifier'),
          password: data.get('password'),
        }),
      });
      router.push(
        result.user.mustChangePassword ? '/mi-cuenta' : destinationForRole(result.user.role),
      );
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.card}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="identifier">Teléfono o correo</label>
          <input
            autoComplete="username"
            id="identifier"
            name="identifier"
            placeholder="+52 999 123 4567"
            required
          />
        </div>
        <PasswordField
          autoComplete="current-password"
          id="password"
          label="Contraseña"
          name="password"
          required
        />
        {error ? <div className={styles.error}>{error}</div> : null}
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
      </form>
    </div>
  );
}
