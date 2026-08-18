'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { ChallengeResult, CurrentUser, Sex } from '@/lib/api';
import { verificationChallengeForStorage } from '@/lib/verification-storage';
import { PasswordField } from './password-field';
import { PhoneField } from './phone-field';
import styles from './portal.module.css';

const sexOptions: Array<{ value: Sex; label: string }> = [
  { value: 'FEMALE', label: 'Mujer' },
  { value: 'MALE', label: 'Hombre' },
  { value: 'OTHER', label: 'Otro' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefiero no decirlo' },
];

export function ProfileDataPanel() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ user: CurrentUser }>('/auth/me')
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => router.replace('/acceso'));
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setError('');
    setSuccess('');
    setLoading(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const phoneValue = data.get('phone');
    const enteredPhone = typeof phoneValue === 'string' ? phoneValue.trim() : '';
    try {
      const result = await apiFetch<{ user: CurrentUser; verification?: ChallengeResult }>(
        '/auth/profile',
        {
          method: 'PATCH',
          body: JSON.stringify({
            fullName: data.get('fullName'),
            ...(user.role !== 'ADMIN' ? { sex: data.get('sex') } : {}),
            phone: enteredPhone || undefined,
            ...(user.role !== 'CLIENT' ? { email: data.get('email') } : {}),
            currentPassword: data.get('currentPassword'),
          }),
        },
      );
      if (result.verification) {
        sessionStorage.setItem(
          'da_verification',
          JSON.stringify(verificationChallengeForStorage(result.verification)),
        );
        router.replace('/verificar');
        router.refresh();
        return;
      }
      setUser(result.user);
      const passwordInput = form.elements.namedItem('currentPassword');
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
      setSuccess('Tus datos quedaron actualizados.');
      window.dispatchEvent(new Event('dearangel:session-changed'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos actualizar tus datos.');
    } finally {
      setLoading(false);
    }
  }

  if (!user) return <div className={styles.loading}>Abriendo tus datos…</div>;

  return (
    <div className={styles.card}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.gridTwo}>
          <div className={styles.field}>
            <label htmlFor="fullName">Nombre completo</label>
            <input
              defaultValue={user.fullName}
              id="fullName"
              maxLength={120}
              name="fullName"
              required
            />
          </div>
          {user.role !== 'ADMIN' ? (
            <div className={styles.field}>
              <label htmlFor="sex">¿Cómo quieres que nos dirijamos a ti?</label>
              <select defaultValue={user.sex ?? 'PREFER_NOT_TO_SAY'} id="sex" name="sex" required>
                {sexOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={styles.field}>
              <label>Perfil</label>
              <input disabled value="Administradora" />
            </div>
          )}
        </div>
        <div className={styles.gridTwo}>
          <PhoneField
            defaultValue={user.phone}
            hint={
              user.role === 'CLIENT'
                ? 'Si lo cambias, enviaremos un código al número nuevo.'
                : undefined
            }
            id="phone"
            label={`WhatsApp ${user.role === 'CLIENT' ? '' : '(opcional)'}`.trim()}
            name="phone"
            required={user.role === 'CLIENT'}
          />
          {user.role !== 'CLIENT' ? (
            <div className={styles.field}>
              <label htmlFor="email">Correo de acceso</label>
              <input
                autoComplete="email"
                defaultValue={user.email ?? ''}
                id="email"
                name="email"
                required
                type="email"
              />
            </div>
          ) : null}
        </div>
        <div className={styles.divider} />
        <PasswordField
          autoComplete="current-password"
          id="currentPassword"
          label="Contraseña actual para guardar"
          name="currentPassword"
          required
        />
        <p className={styles.fieldHint}>
          La pedimos para evitar que alguien cambie tus datos si dejas abierta la sesión.
        </p>
        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div className={styles.success}>{success}</div> : null}
        <button className={styles.primaryButton} disabled={loading} type="submit">
          {loading ? 'Guardando…' : 'Guardar mis datos'}
        </button>
      </form>
    </div>
  );
}
