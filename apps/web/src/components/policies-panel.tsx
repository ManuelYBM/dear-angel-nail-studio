'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import portal from './portal.module.css';
import styles from './payment.module.css';

interface PublicPolicies {
  policyVersion: string;
  policyText: string;
}

export function PoliciesPanel() {
  const [policies, setPolicies] = useState<PublicPolicies | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<PublicPolicies>('/payments/policies')
      .then(setPolicies)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'No pudimos mostrar las políticas.'),
      );
  }, []);

  if (error) return <div className={portal.error}>{error}</div>;
  if (!policies) return <div className={portal.loading}>Consultando políticas…</div>;

  return (
    <article className={styles.policyPage}>
      <span className={styles.caption}>Versión vigente · {policies.policyVersion}</span>
      <div>{policies.policyText}</div>
      <p>La aceptación se solicita nuevamente antes de enviar cada comprobante de anticipo.</p>
    </article>
  );
}
