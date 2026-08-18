'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser, DepositPayment, PaymentSettings, ReservationReceipt } from '@/lib/api';
import portal from './portal.module.css';
import styles from './payment.module.css';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function dateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Merida',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

const statusText = {
  AWAITING_RECEIPT: 'Esperando comprobante',
  PENDING_REVIEW: 'Pago por verificar',
  APPROVED: 'Reservación confirmada',
  REJECTED: 'Comprobante rechazado',
  EXPIRED: 'Apartado vencido',
  CANCELLED: 'Anticipo cancelado',
};

export function PaymentPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get('appointmentId');
  const [deposit, setDeposit] = useState<DepositPayment | null>(null);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [receipt, setReceipt] = useState<ReservationReceipt | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receiptError, setReceiptError] = useState('');

  useEffect(() => {
    if (!appointmentId) {
      setError('Abre el anticipo desde una cita apartada.');
      return;
    }
    void Promise.all([
      apiFetch<{ user: CurrentUser }>('/auth/me'),
      apiFetch<PaymentSettings>('/payments/settings'),
      apiFetch<{ deposit: DepositPayment }>(`/payments/appointments/${appointmentId}`),
    ])
      .then(([session, paymentSettings, result]) => {
        if (session.user.role !== 'CLIENT') throw new Error('Esta vista pertenece a clientes.');
        if (session.user.mustChangePassword) {
          router.replace('/mi-cuenta');
          return;
        }
        setSettings(paymentSettings);
        setDeposit(result.deposit);
        if (result.deposit.status === 'APPROVED') {
          void loadReceipt(appointmentId).catch((reason) =>
            setReceiptError(
              reason instanceof Error
                ? reason.message
                : 'La cita está confirmada, pero no pudimos abrir el comprobante digital.',
            ),
          );
        }
      })
      .catch((reason) => {
        if (reason instanceof Error && reason.message.includes('sesión')) router.replace('/acceso');
        else setError(reason instanceof Error ? reason.message : 'No pudimos abrir el anticipo.');
      });
  }, [appointmentId, router]);

  useEffect(() => {
    if (!deposit?.appointment.holdExpiresAt || deposit.status !== 'AWAITING_RECEIPT') return;
    const tick = () =>
      setRemaining(
        Math.max(
          0,
          Math.ceil(
            (new Date(deposit.appointment.holdExpiresAt as string).getTime() - Date.now()) / 1000,
          ),
        ),
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deposit]);

  const countdown = useMemo(
    () =>
      `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`,
    [remaining],
  );

  async function loadReceipt(id: string) {
    const result = await apiFetch<{ receipt: ReservationReceipt }>(
      `/payments/appointments/${id}/confirmation`,
    );
    setReceipt(result.receipt);
    setReceiptError('');
  }

  async function refreshDeposit(silent = false) {
    if (!appointmentId) return;
    if (!silent) setBusy(true);
    setError('');
    try {
      const result = await apiFetch<{ deposit: DepositPayment }>(
        `/payments/appointments/${appointmentId}`,
      );
      setDeposit(result.deposit);
      if (result.deposit.status === 'APPROVED') {
        try {
          await loadReceipt(appointmentId);
        } catch (reason) {
          setReceiptError(
            reason instanceof Error
              ? reason.message
              : 'La cita está confirmada, pero no pudimos abrir el comprobante digital.',
          );
        }
      }
    } catch (reason) {
      if (!silent)
        setError(reason instanceof Error ? reason.message : 'No pudimos actualizar el anticipo.');
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    if (deposit?.status !== 'PENDING_REVIEW' || !appointmentId) return;
    const timer = window.setInterval(() => void refreshDeposit(true), 15_000);
    return () => window.clearInterval(timer);
  }, [appointmentId, deposit?.status]);

  useEffect(() => {
    const expiresAt = deposit?.appointment.holdExpiresAt;
    if (
      deposit?.status === 'AWAITING_RECEIPT' &&
      expiresAt &&
      remaining === 0 &&
      Date.now() >= Date.parse(expiresAt)
    ) {
      void refreshDeposit();
    }
  }, [deposit?.appointment.holdExpiresAt, deposit?.status, remaining]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appointmentId || !settings) return;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    data.set('policyVersion', settings.policyVersion);
    data.set('policiesAccepted', 'true');
    try {
      const result = await apiFetch<{ deposit: DepositPayment }>(
        `/payments/appointments/${appointmentId}/receipt`,
        { method: 'POST', body: data },
      );
      setDeposit(result.deposit);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos enviar el comprobante.');
    } finally {
      setBusy(false);
    }
  }

  if (!appointmentId) {
    return (
      <div className={portal.card}>
        <div className={portal.error} role="alert">
          Abre el anticipo desde una cita apartada para identificar la reservación.
        </div>
        <div className={portal.formFooter}>
          <Link className={portal.textLink} href="/agenda">
            Ver mis citas
          </Link>
          <Link className={portal.textLink} href="/reservar">
            Buscar otro horario
          </Link>
        </div>
      </div>
    );
  }

  if (!deposit || !settings) {
    return (
      <div className={error ? portal.error : portal.loading}>
        {error || 'Abriendo tu anticipo…'}
      </div>
    );
  }

  return (
    <div className={styles.paymentGrid}>
      <section className={styles.depositCard}>
        <span className={styles.caption}>Anticipo de reservación</span>
        <strong className={styles.amount}>{money.format(deposit.amountCents / 100)}</strong>
        <span className={styles.status}>{statusText[deposit.status]}</span>
        <div className={styles.bankDetails}>
          <div>
            <span>Beneficiaria</span>
            <strong>{deposit.recipientName}</strong>
          </div>
          <div>
            <span>Banco</span>
            <strong>{deposit.bankName}</strong>
          </div>
          <div>
            <span>CLABE</span>
            <strong>{deposit.clabe}</strong>
          </div>
          {deposit.accountNumber ? (
            <div>
              <span>Cuenta</span>
              <strong>{deposit.accountNumber}</strong>
            </div>
          ) : null}
        </div>
        <span className={styles.caption}>Referencia obligatoria</span>
        <strong className={styles.reference}>{deposit.reference}</strong>
        <p className={portal.compactCopy}>{deposit.transferNotes}</p>
        <div className={styles.reviewMeta}>
          <div>
            <span>Cita</span>
            <strong>{dateTime(deposit.appointment.startAt)}</strong>
          </div>
          <div>
            <span>Manicurista</span>
            <strong>{deposit.appointment.technician.fullName}</strong>
          </div>
        </div>
      </section>

      <section className={styles.settingsCard}>
        {deposit.status === 'AWAITING_RECEIPT' ? (
          <>
            <span className={styles.caption}>Completa tu apartado</span>
            <h2>Sube el comprobante</h2>
            <div className={styles.deadline}>
              Tiempo restante: <strong>{countdown}</strong>. Si termina sin archivo, el horario se
              libera.
            </div>
            <form className={styles.uploadForm} onSubmit={upload}>
              <label>
                Comprobante JPG, PNG, WebP o PDF
                <input
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  name="receipt"
                  required
                  type="file"
                />
              </label>
              <div className={styles.policyBox}>{settings.policyText}</div>
              <label className={styles.check}>
                <input name="acceptance" required type="checkbox" />
                Acepto estas políticas, incluida la condición de que el anticipo no es reembolsable.
              </label>
              <Link className={styles.receiptLink} href="/politicas">
                Leer las políticas en una página aparte
              </Link>
              {error ? <div className={portal.error}>{error}</div> : null}
              <button
                className={portal.primaryButton}
                disabled={busy || remaining === 0}
                type="submit"
              >
                Enviar comprobante
              </button>
            </form>
          </>
        ) : deposit.status === 'PENDING_REVIEW' ? (
          <>
            <span className={styles.caption}>Comprobante recibido</span>
            <h2>Tu horario sigue protegido.</h2>
            <p>
              La administradora revisará la transferencia. Verás aquí la confirmación cuando sea
              aprobada.
            </p>
            {deposit.receipt ? (
              <p>
                Archivo: <strong>{deposit.receipt.filename}</strong>
              </p>
            ) : null}
            <Link className={styles.receiptLink} href="/agenda">
              Consultar mis citas
            </Link>
            <button
              className={portal.secondaryButton}
              disabled={busy}
              onClick={() => void refreshDeposit()}
              type="button"
            >
              {busy ? 'Actualizando…' : 'Actualizar estado'}
            </button>
          </>
        ) : deposit.status === 'APPROVED' ? (
          receipt ? (
            <article className={styles.receiptCard}>
              <span className={styles.caption}>Comprobante digital de reservación</span>
              <h2>Tu cita está confirmada.</h2>
              <strong className={styles.receiptFolio}>{receipt.folio}</strong>
              <div className={styles.reviewMeta}>
                <div>
                  <span>Anticipo</span>
                  <strong>{money.format(receipt.amountCents / 100)}</strong>
                </div>
                <div>
                  <span>Referencia</span>
                  <strong>{receipt.reference}</strong>
                </div>
                <div>
                  <span>Fecha</span>
                  <strong>{dateTime(receipt.startAt)}</strong>
                </div>
                <div>
                  <span>Manicurista</span>
                  <strong>{receipt.technician.fullName}</strong>
                </div>
              </div>
              <p>{receipt.notice}</p>
              <button
                className={portal.secondaryButton}
                onClick={() => window.print()}
                type="button"
              >
                Imprimir o guardar en PDF
              </button>
            </article>
          ) : (
            <>
              <span className={styles.caption}>Reservación confirmada</span>
              <h2>Estamos preparando tu comprobante digital.</h2>
              {receiptError ? (
                <div className={portal.error} role="alert">
                  {receiptError}
                </div>
              ) : (
                <p>La cita ya está confirmada. El comprobante puede tardar unos segundos.</p>
              )}
              <button
                className={portal.secondaryButton}
                disabled={busy}
                onClick={() => void refreshDeposit()}
                type="button"
              >
                {busy ? 'Actualizando…' : 'Volver a cargar comprobante'}
              </button>
            </>
          )
        ) : (
          <>
            <span className={styles.caption}>Apartado finalizado</span>
            <h2>{statusText[deposit.status]}</h2>
            <p>
              {deposit.reviewNotes ??
                'El horario ya no está bloqueado. Puedes elegir otra hora desde la agenda.'}
            </p>
            <Link className={portal.primaryLink} href="/reservar">
              Elegir otro horario
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
