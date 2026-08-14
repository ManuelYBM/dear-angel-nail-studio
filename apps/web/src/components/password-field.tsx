'use client';

import { useId, useState } from 'react';
import type { InputHTMLAttributes } from 'react';

import styles from './portal.module.css';

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  hint?: string;
  label: string;
};

export function PasswordField({ hint, id, label, ...inputProps }: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.field}>
      <label htmlFor={inputId}>{label}</label>
      <div className={styles.passwordControl}>
        <input
          {...inputProps}
          aria-describedby={hintId ?? inputProps['aria-describedby']}
          className={styles.passwordInput}
          id={inputId}
          type={visible ? 'text' : 'password'}
        />
        <button
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          className={styles.passwordToggle}
          onClick={() => setVisible((current) => !current)}
          title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          type="button"
        >
          {visible ? (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 5.2 9 5.2a15 15 0 0 1-2.4 3M6.6 6.6C4.3 8 3 10 3 10s3.5 5.2 9 5.2c1 0 2-.2 2.8-.5" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M3 10s3.5-5.2 9-5.2S21 10 21 10s-3.5 5.2-9 5.2S3 10 3 10Z" />
              <circle cx="12" cy="10" r="2.4" />
            </svg>
          )}
        </button>
      </div>
      {hint ? (
        <span className={styles.fieldHint} id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
