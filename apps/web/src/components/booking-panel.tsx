'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type {
  Appointment,
  AvailabilityResponse,
  AvailabilitySlot,
  CatalogDesign,
  CurrentUser,
  CustomQuote,
  TechnicianSummary,
} from '@/lib/api';
import styles from './portal.module.css';

const meridaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Merida',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateAfter(days: number) {
  return meridaDate.format(new Date(Date.now() + days * 86_400_000));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Merida',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function BookingPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const designId = searchParams.get('designId');
  const quoteId = searchParams.get('quoteId');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [technicianId, setTechnicianId] = useState('');
  const [date, setDate] = useState(dateAfter(1));
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [selected, setSelected] = useState<AvailabilitySlot | null>(null);
  const [held, setHeld] = useState<Appointment | null>(null);
  const [selectedDesign, setSelectedDesign] = useState<CatalogDesign | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<CustomQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadAvailability = useCallback(async () => {
    setLoading(true);
    setError('');
    setSelected(null);
    const params = new URLSearchParams({ from: date, to: date });
    const requiredTechnicianId = selectedQuote?.assignedTechnician?.id ?? technicianId;
    if (requiredTechnicianId) params.set('technicianId', requiredTechnicianId);
    const duration = selectedQuote?.confirmedDurationMinutes ?? selectedDesign?.durationMinutes;
    if (duration) params.set('durationMinutes', String(duration));
    try {
      const result = await apiFetch<AvailabilityResponse>(
        `/scheduling/availability?${params.toString()}`,
      );
      setAvailability(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos consultar la agenda.');
      setAvailability(null);
    } finally {
      setLoading(false);
    }
  }, [
    date,
    selectedDesign?.durationMinutes,
    selectedQuote?.assignedTechnician?.id,
    selectedQuote?.confirmedDurationMinutes,
    technicianId,
  ]);

  useEffect(() => {
    void Promise.all([
      apiFetch<{ items: TechnicianSummary[] }>('/scheduling/technicians'),
      apiFetch<{ user: CurrentUser }>('/auth/me').catch(() => null),
    ])
      .then(([team, session]) => {
        setTechnicians(team.items);
        setUser(session?.user ?? null);
      })
      .catch(() => setError('No pudimos cargar el equipo de Dear Angel.'));
  }, []);

  useEffect(() => {
    if (designId) {
      void apiFetch<{ design: CatalogDesign }>(`/catalog/designs/${designId}`)
        .then(({ design }) => setSelectedDesign(design))
        .catch((reason) =>
          setError(reason instanceof Error ? reason.message : 'No encontramos el diseño.'),
        );
    }
    if (quoteId) {
      void apiFetch<{ quote: CustomQuote }>(`/catalog/quotes/${quoteId}`)
        .then(({ quote }) => {
          if (quote.status !== 'APPROVED')
            throw new Error('La cotización todavía no está lista para reservar.');
          setSelectedQuote(quote);
          if (quote.assignedTechnician?.id) setTechnicianId(quote.assignedTechnician.id);
        })
        .catch((reason) =>
          setError(reason instanceof Error ? reason.message : 'No encontramos la cotización.'),
        );
    }
  }, [designId, quoteId]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  async function reserve() {
    if (!selected) return;
    if (!user) {
      router.push('/acceso');
      return;
    }
    if (user.role !== 'CLIENT') {
      setError('Las reservas en línea se realizan desde un perfil de cliente.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await apiFetch<{ appointment: Appointment }>('/appointments/hold', {
        method: 'POST',
        body: JSON.stringify({
          startAt: selected.startAt,
          technicianId: selectedQuote?.assignedTechnician?.id ?? (technicianId || undefined),
          notes: selectedDesign
            ? `Diseño: ${selectedDesign.title}`
            : selectedQuote
              ? 'Diseño personalizado aprobado'
              : 'Diseño por definir',
          catalogDesignId: selectedDesign?.id,
          customQuoteId: selectedQuote?.id,
        }),
      });
      setHeld(result.appointment);
      setSelected(null);
      await loadAvailability();
      router.push(`/anticipo?appointmentId=${result.appointment.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos apartar el horario.');
      await loadAvailability();
    } finally {
      setSaving(false);
    }
  }

  const slots = availability?.days[0]?.slots ?? [];

  return (
    <div className={styles.bookingGrid}>
      <section className={styles.softCard}>
        <div className={styles.stepHeading}>
          <span>01</span>
          <div>
            <h2>Elige tu experiencia</h2>
            <p>
              Puedes reservar con alguien en especial o ver la primera disponibilidad del equipo.
            </p>
          </div>
        </div>
        {selectedDesign || selectedQuote ? (
          <div className={styles.notice}>
            <strong>{selectedDesign?.title ?? 'Diseño personalizado aprobado'}</strong>
            <span>
              {selectedDesign
                ? `${selectedDesign.durationMinutes} min · $${selectedDesign.priceCents / 100} MXN`
                : `${selectedQuote?.confirmedDurationMinutes} min · $${(selectedQuote?.confirmedPriceCents ?? 0) / 100} MXN`}
            </span>
          </div>
        ) : (
          <div className={styles.formFooter}>
            <Link className={styles.textLink} href="/catalogo">
              Elegir del catálogo
            </Link>
            <Link className={styles.textLink} href="/cotizar">
              Cotizar un diseño
            </Link>
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor="bookingTechnician">Manicurista</label>
          <select
            id="bookingTechnician"
            disabled={Boolean(selectedQuote?.assignedTechnician)}
            onChange={(event) => setTechnicianId(event.target.value)}
            value={technicianId}
          >
            <option value="">Cualquiera disponible</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="bookingDate">Fecha</label>
          <input
            id="bookingDate"
            max={dateAfter(14)}
            min={dateAfter(0)}
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
        </div>
        <div className={styles.policyStrip}>
          <span>
            {availability?.policy.durationMinutes ??
              selectedQuote?.confirmedDurationMinutes ??
              selectedDesign?.durationMinutes ??
              60}{' '}
            min
          </span>
          <span>Desde 4 h antes</span>
          <span>Hasta 2 semanas</span>
          <Link href="/politicas">Consultar políticas</Link>
        </div>
      </section>

      <section className={styles.softCard}>
        <div className={styles.stepHeading}>
          <span>02</span>
          <div>
            <h2>Selecciona una hora</h2>
            <p>Los horarios mostrados ya respetan descansos y citas existentes.</p>
          </div>
        </div>
        {loading ? <div className={styles.loading}>Buscando espacios bonitos para ti…</div> : null}
        {!loading && slots.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>Ese día ya está completo.</strong>
            <span>Prueba otra fecha o selecciona a cualquier manicurista.</span>
          </div>
        ) : null}
        <div className={styles.slotGrid}>
          {slots.map((slot) => (
            <button
              className={`${styles.slotButton} ${selected?.startAt === slot.startAt ? styles.slotSelected : ''}`}
              key={slot.startAt}
              onClick={() => setSelected(slot)}
              type="button"
            >
              <strong>{timeLabel(slot.startAt)}</strong>
              <span>
                {technicianId
                  ? slot.technicians[0]?.fullName
                  : `${slot.technicians.length} disponible${slot.technicians.length === 1 ? '' : 's'}`}
              </span>
            </button>
          ))}
        </div>
        {error ? <div className={styles.error}>{error}</div> : null}
        {selected ? (
          <div className={styles.bookingSummary}>
            <div>
              <span>Tu selección</span>
              <strong>{timeLabel(selected.startAt)}</strong>
            </div>
            <button
              className={styles.primaryButton}
              disabled={saving}
              onClick={reserve}
              type="button"
            >
              {user ? 'Apartar horario' : 'Iniciar sesión para reservar'}
            </button>
          </div>
        ) : null}
        {held ? (
          <div className={styles.holdCard}>
            <span>Horario apartado</span>
            <strong>
              {timeLabel(held.startAt)} con {held.technician.fullName}
            </strong>
            <p>
              Estará protegido durante {availability?.policy.holdMinutes ?? 10} minutos para que
              completes el envío de tu comprobante de anticipo.
            </p>
            <Link className={styles.textLink} href={`/anticipo?appointmentId=${held.id}`}>
              Ver transferencia y subir comprobante
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
