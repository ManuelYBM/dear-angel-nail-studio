'use client';

import { useRouter } from 'next/navigation';

import styles from './back-button.module.css';

export function BackButton() {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  }

  return (
    <button
      aria-label="Regresar a la pantalla anterior"
      className={styles.button}
      onClick={goBack}
      title="Regresar"
      type="button"
    >
      <span aria-hidden="true">←</span>
    </button>
  );
}
