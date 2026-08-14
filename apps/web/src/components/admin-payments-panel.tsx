'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser, DepositPayment, PaymentSettings } from '@/lib/api';
import { clientLabel } from '@/lib/person';
import portal from './portal.module.css';
import styles from './payment.module.css';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function dateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Merida',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AdminPaymentsPanel() {
  const router = useRouter();
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [deposits, setDeposits] = useState<DepositPayment[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [session, configuration, queue] = await Promise.all([
      apiFetch<{ user: CurrentUser }>('/auth/me'),
      apiFetch<{ settings: PaymentSettings }>('/admin/payments/settings'),
      apiFetch<{ items: DepositPayment[] }>('/payments?status=PENDING_REVIEW'),
    ]);
    if (session.user.role !== 'ADMIN') throw new Error('Esta vista pertenece a la administradora.');
    setSettings(configuration.settings);
    setDeposits(queue.items);
  }, []);

  useEffect(() => {
    void load().catch((reason) => {
      if (reason instanceof Error && reason.message.includes('sesión')) router.replace('/acceso');
      else setError(reason instanceof Error ? reason.message : 'No pudimos abrir los anticipos.');
    });
  }, [load, router]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiFetch<{ settings: PaymentSettings }>('/admin/payments/settings', {
        method: 'PUT',
        body: JSON.stringify({
          amountCents: Math.round(Number(data.get('amount')) * 100),
          recipientName: data.get('recipientName'),
          bankName: data.get('bankName'),
          clabe: data.get('clabe'),
          accountNumber: data.get('accountNumber') || undefined,
          transferNotes: data.get('transferNotes'),
          policyVersion: data.get('policyVersion'),
          policyText: data.get('policyText'),
        }),
      });
      setSettings(result.settings);
      setNotice('La configuración se aplicará a las nuevas reservaciones.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar la configuración.');
    }
  }

  async function review(deposit: DepositPayment, decision: 'APPROVED' | 'REJECTED') {
    setBusy(deposit.id);
    setError('');
    setNotice('');
    const notes = (document.getElementById(`notes-${deposit.id}`) as HTMLTextAreaElement | null)
      ?.value;
    try {
      await apiFetch(`/admin/payments/${deposit.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, notes: notes || undefined }),
      });
      setNotice(
        decision === 'APPROVED'
          ? 'Anticipo aprobado y cita confirmada.'
          : 'Comprobante rechazado y horario liberado.',
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos revisar el anticipo.');
    } finally {
      setBusy('');
    }
  }

  if (!settings)
    return (
      <div className={error ? portal.error : portal.loading}>{error || 'Abriendo anticipos…'}</div>
    );

  return (
    <div className={styles.paymentGrid}>
      <form className={`${styles.settingsCard} ${styles.settingsForm}`} onSubmit={saveSettings}>
        <span className={styles.caption}>Datos para nuevas reservas</span>
        <h2>Transferencia SPEI</h2>
        <label>
          Anticipo MXN
          <input
            defaultValue={settings.amountCents / 100}
            min="1"
            name="amount"
            required
            step="1"
            type="number"
          />
        </label>
        <label>
          Nombre de la beneficiaria
          <input defaultValue={settings.recipientName} name="recipientName" required />
        </label>
        <label>
          Banco
          <input defaultValue={settings.bankName} name="bankName" required />
        </label>
        <label>
          CLABE de 18 dígitos
          <input
            defaultValue={settings.clabe}
            inputMode="numeric"
            maxLength={18}
            minLength={18}
            name="clabe"
            pattern="[0-9]{18}"
            required
          />
        </label>
        <label>
          Número de cuenta opcional
          <input
            defaultValue={settings.accountNumber ?? ''}
            inputMode="numeric"
            name="accountNumber"
            pattern="[0-9]{4,20}"
          />
        </label>
        <label>
          Indicaciones
          <textarea defaultValue={settings.transferNotes} name="transferNotes" required rows={3} />
        </label>
        <label>
          Versión de políticas
          <input defaultValue={settings.policyVersion} name="policyVersion" required />
        </label>
        <label>
          Políticas antes del anticipo
          <textarea defaultValue={settings.policyText} name="policyText" required rows={8} />
        </label>
        <button className={portal.primaryButton} type="submit">
          Guardar datos SPEI
        </button>
      </form>

      <section className={styles.queue}>
        <div>
          <span className={styles.caption}>Decisión exclusiva de la administradora</span>
          <h2 className={portal.sectionTitle}>Pagos por verificar · {deposits.length}</h2>
        </div>
        {error ? <div className={portal.error}>{error}</div> : null}
        {notice ? <div className={portal.success}>{notice}</div> : null}
        {!deposits.length ? (
          <div className={styles.empty}>No hay comprobantes esperando revisión.</div>
        ) : null}
        <div className={styles.reviewList}>
          {deposits.map((deposit) => (
            <article className={styles.reviewCard} key={deposit.id}>
              <header>
                <div>
                  <span className={styles.caption}>{deposit.reference}</span>
                  <h2>{deposit.appointment.client?.fullName ?? 'Cliente'}</h2>
                  <p>
                    {deposit.appointment.client
                      ? clientLabel(deposit.appointment.client.sex)
                      : 'Cliente'}{' '}
                    · {dateTime(deposit.appointment.startAt)} con{' '}
                    {deposit.appointment.technician.fullName}
                  </p>
                </div>
                <strong>{money.format(deposit.amountCents / 100)}</strong>
              </header>
              <div className={styles.reviewMeta}>
                <div>
                  <span>Archivo</span>
                  <strong>{deposit.receipt?.filename}</strong>
                </div>
                <div>
                  <span>Enviado</span>
                  <strong>{deposit.receipt ? dateTime(deposit.receipt.uploadedAt) : ''}</strong>
                </div>
              </div>
              <a
                className={styles.receiptLink}
                href={`/api/backend/payments/${deposit.id}/receipt`}
                rel="noreferrer"
                target="_blank"
              >
                Abrir comprobante privado
              </a>
              <div className={styles.reviewActions}>
                <textarea
                  id={`notes-${deposit.id}`}
                  placeholder="Comentario opcional al aprobar; obligatorio para rechazar"
                  rows={3}
                />
                <div>
                  <button
                    className={portal.primaryButton}
                    disabled={busy === deposit.id}
                    onClick={() => review(deposit, 'APPROVED')}
                    type="button"
                  >
                    Aprobar y confirmar
                  </button>
                  <button
                    className={portal.dangerButton}
                    disabled={busy === deposit.id}
                    onClick={() => review(deposit, 'REJECTED')}
                    type="button"
                  >
                    Rechazar y liberar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
