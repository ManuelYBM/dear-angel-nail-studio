'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { BookingPolicy } from '@/lib/api';
import portal from './portal.module.css';
import styles from './payment.module.css';

interface PublicPolicies {
  policyVersion: string;
  policyText: string;
}

export function PoliciesPanel() {
  const [policies, setPolicies] = useState<PublicPolicies | null>(null);
  const [bookingPolicy, setBookingPolicy] = useState<BookingPolicy | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      apiFetch<PublicPolicies>('/payments/policies'),
      apiFetch<BookingPolicy>('/scheduling/policy'),
    ])
      .then(([paymentPolicies, schedulingPolicy]) => {
        setPolicies(paymentPolicies);
        setBookingPolicy(schedulingPolicy);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'No pudimos mostrar las políticas.'),
      );
  }, []);

  if (error) return <div className={portal.error}>{error}</div>;
  if (!policies || !bookingPolicy)
    return <div className={portal.loading}>Consultando políticas…</div>;

  return (
    <article className={styles.policyPage}>
      <span className={styles.caption}>Versión vigente · {policies.policyVersion}</span>
      <div>{policies.policyText}</div>
      <div className={portal.notice}>
        Puedes reservar con hasta {bookingPolicy.maximumAdvanceDays} día
        {bookingPolicy.maximumAdvanceDays === 1 ? '' : 's'} de anticipación. Los cambios deben
        solicitarse al menos {bookingPolicy.rescheduleNoticeHours} hora
        {bookingPolicy.rescheduleNoticeHours === 1 ? '' : 's'} antes y cada cita permite{' '}
        {bookingPolicy.clientRescheduleLimit} cambio
        {bookingPolicy.clientRescheduleLimit === 1 ? '' : 's'} desde la cuenta de la clienta.
      </div>
      <p>La aceptación se solicita nuevamente antes de enviar cada comprobante de anticipo.</p>
    </article>
  );
}
