'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { ChallengeResult, CurrentUser } from '@/lib/api';
import { PasswordField } from './password-field';
import styles from './portal.module.css';

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      const rawPhone = data.get('phone');
      const phone = typeof rawPhone === 'string' ? rawPhone : '';
      const result = await apiFetch<{ user: CurrentUser; verification: ChallengeResult }>(
        '/auth/register/client',
        {
          method: 'POST',
          body: JSON.stringify({
            fullName: data.get('fullName'),
            sex: data.get('sex'),
            phone,
            password: data.get('password'),
            passwordConfirmation: data.get('passwordConfirmation'),
            acceptedMinorNotice: data.get('acceptedMinorNotice') === 'on',
          }),
        },
      );
      sessionStorage.setItem('da_verification', JSON.stringify({ ...result.verification, phone }));
      router.push('/verificar');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos crear tu cuenta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.card}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="fullName">Nombre completo</label>
          <input autoComplete="name" id="fullName" name="fullName" required />
        </div>
        <div className={styles.gridTwo}>
          <div className={styles.field}>
            <label htmlFor="sex">Sexo</label>
            <select defaultValue="PREFER_NOT_TO_SAY" id="sex" name="sex" required>
              <option value="FEMALE">Mujer</option>
              <option value="MALE">Hombre</option>
              <option value="OTHER">Otro</option>
              <option value="PREFER_NOT_TO_SAY">Prefiero no responder</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="phone">WhatsApp</label>
            <input
              autoComplete="tel"
              id="phone"
              inputMode="tel"
              name="phone"
              placeholder="+52 999 123 4567"
              required
            />
          </div>
        </div>
        <div className={styles.gridTwo}>
          <PasswordField
            autoComplete="new-password"
            hint="Mínimo 8 caracteres, con letra y número."
            id="password"
            label="Contraseña"
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
        <label className={styles.checkbox}>
          <input name="acceptedMinorNotice" required type="checkbox" />
          <span>
            Entiendo que las personas menores de 16 años deben asistir con una persona adulta.
          </span>
        </label>
        {error ? <div className={styles.error}>{error}</div> : null}
        <button className={styles.primaryButton} disabled={loading} type="submit">
          {loading ? 'Preparando tu cuenta…' : 'Crear mi cuenta'}
        </button>
        <div className={styles.formFooter}>
          <span>¿Ya tienes cuenta?</span>
          <Link className={styles.textLink} href="/acceso">
            Iniciar sesión
          </Link>
        </div>
      </form>
    </div>
  );
}
