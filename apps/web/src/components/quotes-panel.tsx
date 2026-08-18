'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser, CustomQuote, QuoteStatus, TechnicianSummary } from '@/lib/api';
import styles from './quotes.module.css';
import portal from './portal.module.css';

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const labels: Record<QuoteStatus, string> = {
  PENDING_REVIEW: 'Pendiente de revisión',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Lista para reservar',
  REJECTED: 'Requiere cambios',
  CANCELLED: 'Cancelada por ti',
};

export function QuotesPanel() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [quotes, setQuotes] = useState<CustomQuote[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState('');

  const load = useCallback(async () => {
    try {
      const [session, list, team] = await Promise.all([
        apiFetch<{ user: CurrentUser }>('/auth/me'),
        apiFetch<{ items: CustomQuote[] }>('/catalog/quotes'),
        apiFetch<{ items: TechnicianSummary[] }>('/scheduling/technicians'),
      ]);
      setUser(session.user);
      setQuotes(list.items);
      setTechnicians(team.items);
    } catch {
      window.location.href = '/acceso';
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function claim(id: string) {
    setError('');
    try {
      await apiFetch(`/catalog/quotes/${id}/claim`, { method: 'POST' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos tomar la solicitud.');
    }
  }

  async function assign(id: string) {
    const technicianId = (document.getElementById(`assign-${id}`) as HTMLSelectElement | null)
      ?.value;
    if (!technicianId) {
      setError('Selecciona una manicurista.');
      return;
    }
    try {
      await apiFetch(`/catalog/quotes/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ technicianId }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos asignar la solicitud.');
    }
  }

  async function review(quote: CustomQuote, approved: boolean) {
    const price = (document.getElementById(`price-${quote.id}`) as HTMLInputElement | null)?.value;
    const duration = (document.getElementById(`duration-${quote.id}`) as HTMLInputElement | null)
      ?.value;
    const comments = (document.getElementById(`comments-${quote.id}`) as HTMLTextAreaElement | null)
      ?.value;
    try {
      await apiFetch(`/catalog/quotes/${quote.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: approved ? 'APPROVED' : 'REJECTED',
          confirmedPriceCents: approved ? Math.round(Number(price) * 100) : undefined,
          confirmedDurationMinutes: approved ? Number(duration) : undefined,
          reviewerComments: comments,
        }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar la revisión.');
    }
  }

  async function cancelQuote(quote: CustomQuote) {
    if (!window.confirm('¿Cancelar esta solicitud de cotización?')) return;
    setCancellingId(quote.id);
    setError('');
    try {
      await apiFetch(`/catalog/quotes/${quote.id}/cancel`, { method: 'PATCH' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos cancelar la cotización.');
    } finally {
      setCancellingId('');
    }
  }

  if (loading) return <div className={portal.loading}>Abriendo cotizaciones…</div>;
  return (
    <div className={styles.list}>
      {error ? <div className={portal.error}>{error}</div> : null}
      {quotes.length === 0 ? (
        <div className={styles.empty}>
          <strong>No hay cotizaciones por ahora.</strong>
          {user?.role === 'CLIENT' ? (
            <Link href="/cotizar">Crear una cotización</Link>
          ) : (
            <span>Las solicitudes nuevas aparecerán aquí.</span>
          )}
        </div>
      ) : null}
      {quotes.map((quote) => (
        <article className={styles.quoteCard} key={quote.id}>
          <header>
            <div>
              <span className={styles[quote.status]}>{labels[quote.status]}</span>
              <h2>
                {quote.noDesign
                  ? 'Diseño por definir'
                  : (quote.selections.find((selection) => selection.optionName)?.optionName ??
                    'Diseño personalizado')}
              </h2>
              <p>
                {user?.role === 'CLIENT'
                  ? (quote.assignedTechnician?.fullName ??
                    quote.preferredTechnician?.fullName ??
                    'Cualquier manicurista')
                  : quote.client.fullName}
              </p>
            </div>
            <div>
              <small>Estimación</small>
              <strong>{money.format(quote.estimatedPriceCents / 100)}</strong>
              <span>{quote.estimatedDurationMinutes} min</span>
            </div>
          </header>
          {quote.clientNotes ? <blockquote>{quote.clientNotes}</blockquote> : null}
          <div className={styles.breakdown}>
            {quote.selections.map((selection) => (
              <span key={selection.id}>
                {selection.optionName}
                {selection.quantity > 1 ? ` ×${selection.quantity}` : ''}
              </span>
            ))}
          </div>
          {quote.images.length ? (
            <div className={styles.photos}>
              {quote.images.map((image) => (
                <img
                  alt="Inspiración de la clienta"
                  key={image.id}
                  src={`/api/backend/catalog/quotes/images/${image.id}`}
                />
              ))}
            </div>
          ) : null}
          {quote.status === 'APPROVED' ? (
            <div className={styles.approved}>
              <span>
                Precio confirmado:{' '}
                <strong>{money.format((quote.confirmedPriceCents ?? 0) / 100)}</strong>
              </span>
              <span>
                Duración: <strong>{quote.confirmedDurationMinutes} min</strong>
              </span>
              {quote.reviewerComments ? <p>{quote.reviewerComments}</p> : null}
              {user?.role === 'CLIENT' ? (
                <Link href={`/reservar?quoteId=${quote.id}`}>
                  Elegir horario con {quote.assignedTechnician?.fullName}
                </Link>
              ) : null}
            </div>
          ) : null}
          {user?.role === 'CLIENT' &&
          (quote.status === 'PENDING_REVIEW' || quote.status === 'IN_REVIEW') ? (
            <button
              className={portal.dangerButton}
              disabled={cancellingId === quote.id}
              onClick={() => void cancelQuote(quote)}
              type="button"
            >
              {cancellingId === quote.id ? 'Cancelando…' : 'Cancelar solicitud'}
            </button>
          ) : null}
          {user?.role === 'NAIL_TECHNICIAN' && quote.status === 'PENDING_REVIEW' ? (
            <button className={portal.primaryButton} onClick={() => claim(quote.id)} type="button">
              Tomar esta solicitud
            </button>
          ) : null}
          {user?.role === 'ADMIN' && quote.status === 'PENDING_REVIEW' ? (
            <div className={styles.assignment}>
              <select defaultValue={quote.preferredTechnician?.id ?? ''} id={`assign-${quote.id}`}>
                <option value="">Seleccionar manicurista</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.fullName}
                  </option>
                ))}
              </select>
              <button onClick={() => assign(quote.id)} type="button">
                Asignar revisión
              </button>
            </div>
          ) : null}
          {user?.role !== 'CLIENT' &&
          quote.status === 'IN_REVIEW' &&
          (quote.assignedTechnician?.id === user?.id || user?.role === 'ADMIN') ? (
            <div className={styles.review}>
              <label>
                Precio final (MXN)
                <input
                  defaultValue={quote.estimatedPriceCents / 100}
                  id={`price-${quote.id}`}
                  min="0"
                  type="number"
                />
              </label>
              <label>
                Duración (min)
                <input
                  defaultValue={quote.estimatedDurationMinutes}
                  id={`duration-${quote.id}`}
                  min="15"
                  step="15"
                  type="number"
                />
              </label>
              <label>
                Comentarios
                <textarea id={`comments-${quote.id}`} rows={3} />
              </label>
              <div>
                <button onClick={() => review(quote, true)} type="button">
                  Aprobar cotización
                </button>
                <button onClick={() => review(quote, false)} type="button">
                  Solicitar cambios
                </button>
              </div>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
