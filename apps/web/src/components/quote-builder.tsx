'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { CalculatorOption, CurrentUser, CustomQuote, TechnicianSummary } from '@/lib/api';
import styles from './quote.module.css';
import portal from './portal.module.css';

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const kindLabels = {
  TECHNIQUE: 'Elige una técnica',
  LENGTH: 'Selecciona el largo',
  DECORATION: 'Agrega decoraciones',
  EXTRA: 'Detalles adicionales',
};

export function QuoteBuilder() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [options, setOptions] = useState<CalculatorOption[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [preferredTechnicianId, setPreferredTechnicianId] = useState('');
  const [noDesign, setNoDesign] = useState(false);
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [created, setCreated] = useState<CustomQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      apiFetch<{ items: CalculatorOption[] }>('/catalog/calculator'),
      apiFetch<{ items: TechnicianSummary[] }>('/scheduling/technicians'),
      apiFetch<{ user: CurrentUser }>('/auth/me').catch(() => null),
    ])
      .then(([calculator, team, session]) => {
        setOptions(calculator.items);
        setTechnicians(team.items);
        setUser(session?.user ?? null);
      })
      .catch(() => setError('No pudimos cargar la calculadora.'))
      .finally(() => setLoading(false));
  }, []);

  const visibleOptions = useMemo(() => {
    const techniqueId = Object.entries(quantities).find(
      ([id, quantity]) =>
        quantity > 0 && options.find((option) => option.id === id)?.kind === 'TECHNIQUE',
    )?.[0];
    return options.filter(
      (option) => option.kind !== 'LENGTH' || option.parentOptionId === techniqueId,
    );
  }, [options, quantities]);

  const selected = options.filter((option) => (quantities[option.id] ?? 0) > 0);
  const estimatedPrice = selected.reduce(
    (total, option) =>
      total +
      option.priceCents * (option.pricingMode === 'PER_UNIT' ? (quantities[option.id] ?? 1) : 1),
    0,
  );
  const estimatedTime = Math.max(
    60,
    selected.reduce(
      (total, option) =>
        total +
        option.durationMinutes *
          (option.pricingMode === 'PER_UNIT' ? (quantities[option.id] ?? 1) : 1),
      0,
    ),
  );

  function setQuantity(option: CalculatorOption, next: number) {
    setNoDesign(false);
    setQuantities((current) => {
      const updated = { ...current };
      if (option.kind === 'TECHNIQUE') {
        for (const item of options.filter(
          (candidate) => candidate.kind === 'TECHNIQUE' || candidate.kind === 'LENGTH',
        ))
          delete updated[item.id];
      } else if (option.kind === 'LENGTH') {
        for (const item of options.filter((candidate) => candidate.kind === 'LENGTH'))
          delete updated[item.id];
      }
      const value = Math.max(0, Math.min(option.maxQuantity, next));
      if (value) updated[option.id] = value;
      else delete updated[option.id];
      return updated;
    });
  }

  async function submit() {
    if (!user) {
      window.location.href = '/acceso';
      return;
    }
    if (user.role !== 'CLIENT') {
      setError('Esta solicitud se envía desde una cuenta de clienta.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await apiFetch<{ quote: CustomQuote }>('/catalog/quotes', {
        method: 'POST',
        body: JSON.stringify({
          preferredTechnicianId: preferredTechnicianId || undefined,
          noDesign,
          clientNotes: notes,
          selections: noDesign
            ? []
            : selected.map((option) => ({
                optionId: option.id,
                quantity: quantities[option.id] ?? 1,
              })),
        }),
      });
      for (const image of images) {
        const form = new FormData();
        form.append('image', image);
        await apiFetch(`/catalog/quotes/${result.quote.id}/images`, { method: 'POST', body: form });
      }
      setCreated(result.quote);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos enviar tu solicitud.');
    } finally {
      setSaving(false);
    }
  }

  if (created)
    return (
      <div className={styles.successCard}>
        <span>✓</span>
        <h2>Tu diseño ya está en revisión</h2>
        <p>
          {created.assignedTechnician
            ? `${created.assignedTechnician.fullName} revisará tu solicitud.`
            : 'La primera manicurista disponible podrá tomarla.'}{' '}
          No se bloqueó ningún horario todavía.
        </p>
        <Link href="/cotizaciones">Ver mis cotizaciones</Link>
      </div>
    );
  if (loading) return <div className={portal.loading}>Preparando la calculadora…</div>;

  return (
    <div className={styles.quoteLayout}>
      <div className={styles.builder}>
        <button
          className={`${styles.noDesign} ${noDesign ? styles.selected : ''}`}
          onClick={() => {
            setNoDesign(true);
            setQuantities({});
          }}
          type="button"
        >
          <span>?</span>
          <div>
            <strong>No tengo diseño todavía</strong>
            <small>Cuéntanos tu idea y una manicurista te ayuda a definirla.</small>
          </div>
        </button>
        {(['TECHNIQUE', 'LENGTH', 'DECORATION', 'EXTRA'] as const).map((kind, index) => {
          const group = visibleOptions.filter((option) => option.kind === kind);
          if (!group.length) return null;
          return (
            <section className={styles.optionSection} key={kind}>
              <header>
                <span>0{index + 1}</span>
                <h2>{kindLabels[kind]}</h2>
              </header>
              <div className={kind === 'DECORATION' ? styles.optionGridCompact : styles.optionGrid}>
                {group.map((option) => {
                  const quantity = quantities[option.id] ?? 0;
                  return (
                    <article
                      className={`${styles.optionCard} ${quantity ? styles.selected : ''}`}
                      key={option.id}
                    >
                      <button
                        className={styles.optionMain}
                        onClick={() => setQuantity(option, quantity ? 0 : 1)}
                        type="button"
                      >
                        <span>
                          {option.iconObjectKey ? (
                            <img alt="" src={`/api/backend/catalog/calculator/${option.id}/icon`} />
                          ) : (
                            option.iconText
                          )}
                        </span>
                        <div>
                          <strong>{option.name}</strong>
                          <small>
                            {money.format(option.priceCents / 100)}
                            {option.pricingMode === 'PER_UNIT' ? ' por uña' : ''}
                          </small>
                        </div>
                      </button>
                      {option.maxQuantity > 1 && quantity ? (
                        <div className={styles.counter}>
                          <button onClick={() => setQuantity(option, quantity - 1)} type="button">
                            −
                          </button>
                          <span>{quantity}</span>
                          <button onClick={() => setQuantity(option, quantity + 1)} type="button">
                            +
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        <section className={styles.details}>
          <h2>Últimos detalles</h2>
          <label>
            ¿Quién quieres que revise?
            <select
              onChange={(event) => setPreferredTechnicianId(event.target.value)}
              value={preferredTechnicianId}
            >
              <option value="">Cualquiera disponible</option>
              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cuéntanos cómo lo imaginas
            <textarea
              maxLength={1500}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Colores, ocasión, cambios que te gustaría hacer…"
              rows={4}
              value={notes}
            />
          </label>
          <label>
            Fotos de inspiración (hasta 5)
            <input
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => setImages(Array.from(event.target.files ?? []).slice(0, 5))}
              type="file"
            />
          </label>
          {images.length ? (
            <small>
              {images.length} imagen{images.length === 1 ? '' : 'es'} seleccionada
              {images.length === 1 ? '' : 's'}
            </small>
          ) : null}
        </section>
      </div>
      <aside className={styles.estimate}>
        <span>Estimación inicial</span>
        <strong>{noDesign ? 'Por revisar' : money.format(estimatedPrice / 100)}</strong>
        <p>
          {noDesign
            ? 'La manicurista definirá el tiempo contigo.'
            : `Tiempo estimado: ${estimatedTime} minutos`}
        </p>
        <ul>
          {selected.map((option) => {
            const quantity = quantities[option.id] ?? 1;
            return (
              <li key={option.id}>
                <span>
                  {option.name}
                  {quantity > 1 ? ` ×${quantity}` : ''}
                </span>
                <span>
                  {money.format(
                    (option.priceCents * (option.pricingMode === 'PER_UNIT' ? quantity : 1)) / 100,
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <div>
          El resultado está sujeto a revisión. Podrás reservar únicamente después de que una
          manicurista confirme precio y duración.
        </div>
        {error ? <p className={portal.error}>{error}</p> : null}
        <button
          disabled={
            saving || (!noDesign && !selected.some((option) => option.kind === 'TECHNIQUE'))
          }
          onClick={submit}
          type="button"
        >
          {saving ? 'Enviando…' : user ? 'Enviar para revisión' : 'Iniciar sesión para enviar'}
        </button>
      </aside>
    </div>
  );
}
