'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { BookingPolicy, CurrentUser, UserStatus, WorkingPeriod } from '@/lib/api';
import styles from './portal.module.css';

interface ScheduleResponse {
  schedule: { usesGlobalSchedule: boolean; acceptingBookings: boolean };
  effectiveWeeklyPeriods: WorkingPeriod[];
  customWeeklyPeriods: WorkingPeriod[];
  globalPeriods: WorkingPeriod[];
  overrides: Array<{
    id: string;
    date: string;
    isClosed: boolean;
    periods: Array<{ startMinute: number; endMinute: number }>;
  }>;
}

interface AdminOverview {
  policy: BookingPolicy;
  periods: WorkingPeriod[];
  technicians: Array<{
    id: string;
    fullName: string;
    status: UserStatus;
    technicianSchedule: {
      usesGlobalSchedule: boolean;
      acceptingBookings: boolean;
    } | null;
  }>;
}

const days = [
  [1, 'Lunes'],
  [2, 'Martes'],
  [3, 'Miércoles'],
  [4, 'Jueves'],
  [5, 'Viernes'],
  [6, 'Sábado'],
  [7, 'Domingo'],
] as const;

const timeOptions = Array.from({ length: 97 }, (_, index) => index * 15);

function timeValue(minute: number) {
  if (minute === 1440) return '24:00';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function databaseDateLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(value),
  );
}

export function SchedulePanel() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [periods, setPeriods] = useState<WorkingPeriod[]>([]);
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideClosed, setOverrideClosed] = useState(true);
  const [overrideStart, setOverrideStart] = useState(480);
  const [overrideEnd, setOverrideEnd] = useState(1440);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warnings, setWarnings] = useState<Array<{ id: string; startAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ user: CurrentUser }>('/auth/me')
      .then(async ({ user: currentUser }) => {
        if (currentUser.role === 'CLIENT') throw new Error('Sin permisos');
        setUser(currentUser);
        if (currentUser.role === 'ADMIN') {
          const result = await apiFetch<AdminOverview>('/admin/scheduling');
          setOverview(result);
          setPolicy(result.policy);
          setPeriods(result.periods);
        } else {
          const result = await apiFetch<ScheduleResponse>('/scheduling/my');
          setSchedule(result);
          setPeriods(result.effectiveWeeklyPeriods);
        }
      })
      .catch(() => router.replace('/acceso'))
      .finally(() => setLoading(false));
  }, [router]);

  async function chooseTechnician(id: string) {
    setSelectedTechnician(id);
    setError('');
    setNotice('');
    if (!id) {
      setSchedule(null);
      setPeriods(overview?.periods ?? []);
      return;
    }
    try {
      const result = await apiFetch<ScheduleResponse>(`/admin/scheduling/technicians/${id}`);
      setSchedule(result);
      setPeriods(result.effectiveWeeklyPeriods);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos abrir ese horario.');
    }
  }

  function addPeriod(dayOfWeek: number) {
    setPeriods((current) => [...current, { dayOfWeek, startMinute: 8 * 60, endMinute: 24 * 60 }]);
  }

  function updatePeriod(index: number, field: 'startMinute' | 'endMinute', value: number) {
    setPeriods((current) =>
      current.map((period, periodIndex) =>
        periodIndex === index ? { ...period, [field]: value } : period,
      ),
    );
  }

  function removePeriod(index: number) {
    setPeriods((current) => current.filter((_, periodIndex) => periodIndex !== index));
  }

  async function saveWeekly() {
    setError('');
    setNotice('');
    try {
      const path =
        user?.role === 'ADMIN'
          ? selectedTechnician
            ? `/admin/scheduling/technicians/${selectedTechnician}/weekly`
            : '/admin/scheduling/global'
          : '/scheduling/my/weekly';
      const result = await apiFetch<{ warnings?: Array<{ id: string; startAt: string }> }>(path, {
        method: 'PUT',
        body: JSON.stringify({
          periods: periods.map(({ dayOfWeek, startMinute, endMinute }) => ({
            dayOfWeek,
            startMinute,
            endMinute,
          })),
        }),
      });
      setWarnings(result.warnings ?? []);
      setNotice(
        selectedTechnician || user?.role === 'NAIL_TECHNICIAN'
          ? 'El horario personal quedó actualizado.'
          : 'El horario base se aplicará a las manicuristas que lo heredan.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar el horario.');
    }
  }

  async function inheritGlobal() {
    const technicianId = user?.role === 'ADMIN' ? selectedTechnician : '';
    const path = technicianId
      ? `/admin/scheduling/technicians/${technicianId}/use-global`
      : '/scheduling/my/use-global';
    try {
      const result = await apiFetch<{ schedule: ScheduleResponse; warnings: typeof warnings }>(
        path,
        {
          method: 'POST',
        },
      );
      setSchedule(result.schedule);
      setPeriods(result.schedule.effectiveWeeklyPeriods);
      setWarnings(result.warnings);
      setNotice('Ahora usa el horario base de Dear Angel.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos restaurar el horario base.');
    }
  }

  async function toggleBookings() {
    if (!schedule) return;
    const technicianId = user?.role === 'ADMIN' ? selectedTechnician : '';
    const path = technicianId
      ? `/admin/scheduling/technicians/${technicianId}/accepting`
      : '/scheduling/my/accepting';
    try {
      const result = await apiFetch<{ schedule: ScheduleResponse['schedule'] }>(path, {
        method: 'PATCH',
        body: JSON.stringify({ acceptingBookings: !schedule.schedule.acceptingBookings }),
      });
      setSchedule((current) => (current ? { ...current, schedule: result.schedule } : current));
      setNotice(
        result.schedule.acceptingBookings
          ? 'El perfil vuelve a recibir nuevas citas.'
          : 'El perfil está en pausa; las citas existentes se conservan.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos cambiar la disponibilidad.');
    }
  }

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const updated = await apiFetch<BookingPolicy>('/admin/scheduling/policy', {
        method: 'PUT',
        body: JSON.stringify({
          defaultDurationMinutes: Number(data.get('defaultDurationMinutes')),
          slotIntervalMinutes: Number(data.get('slotIntervalMinutes')),
          minimumLeadMinutes: Number(data.get('minimumLeadMinutes')),
          maximumAdvanceDays: Number(data.get('maximumAdvanceDays')),
          holdMinutes: Number(data.get('holdMinutes')),
          rescheduleNoticeHours: Number(data.get('rescheduleNoticeHours')),
          clientRescheduleLimit: Number(data.get('clientRescheduleLimit')),
        }),
      });
      setPolicy(updated);
      setNotice('Las reglas generales de reservación quedaron actualizadas.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar las reglas.');
    }
  }

  async function saveOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overrideDate) return;
    const technicianId = user?.role === 'ADMIN' ? selectedTechnician : '';
    const path = technicianId
      ? `/admin/scheduling/technicians/${technicianId}/overrides/${overrideDate}`
      : `/scheduling/my/overrides/${overrideDate}`;
    try {
      const result = await apiFetch<{
        override: ScheduleResponse['overrides'][number];
        warnings: typeof warnings;
      }>(path, {
        method: 'PUT',
        body: JSON.stringify({
          isClosed: overrideClosed,
          periods: overrideClosed ? [] : [{ startMinute: overrideStart, endMinute: overrideEnd }],
        }),
      });
      setSchedule((current) =>
        current
          ? {
              ...current,
              overrides: [
                result.override,
                ...current.overrides.filter((item) => item.date.slice(0, 10) !== overrideDate),
              ],
            }
          : current,
      );
      setWarnings(result.warnings);
      setNotice('La excepción de ese día quedó guardada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar esa fecha.');
    }
  }

  async function removeOverride(item: ScheduleResponse['overrides'][number]) {
    const date = item.date.slice(0, 10);
    const technicianId = user?.role === 'ADMIN' ? selectedTechnician : '';
    const path = technicianId
      ? `/admin/scheduling/technicians/${technicianId}/overrides/${date}`
      : `/scheduling/my/overrides/${date}`;
    setError('');
    setNotice('');
    try {
      const result = await apiFetch<{ warnings?: typeof warnings }>(path, { method: 'DELETE' });
      setSchedule((current) =>
        current
          ? { ...current, overrides: current.overrides.filter((entry) => entry.id !== item.id) }
          : current,
      );
      setWarnings(result.warnings ?? []);
      setNotice('La fecha volvió a usar el horario semanal.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos eliminar esa excepción.');
    }
  }

  if (loading || !user) return <div className={styles.loading}>Preparando horarios…</div>;
  const editingGlobal = user.role === 'ADMIN' && !selectedTechnician;

  return (
    <div className={styles.scheduleLayout}>
      <section className={styles.softCard}>
        <div className={styles.toolbar}>
          <div>
            <span className={styles.eyebrow}>Disponibilidad semanal</span>
            <h2 className={styles.sectionTitle}>
              {editingGlobal ? 'Horario base' : 'Horario personal'}
            </h2>
          </div>
          <Link className={styles.textLink} href="/agenda">
            Ver agenda
          </Link>
        </div>
        {user.role === 'ADMIN' ? (
          <div className={styles.field}>
            <label htmlFor="scheduleOwner">Configurar</label>
            <select
              id="scheduleOwner"
              onChange={(event) => void chooseTechnician(event.target.value)}
              value={selectedTechnician}
            >
              <option value="">Horario base de Dear Angel</option>
              {overview?.technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.fullName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {!editingGlobal && schedule ? (
          <div className={styles.scheduleControls}>
            <button className={styles.secondaryButton} onClick={toggleBookings} type="button">
              {schedule.schedule.acceptingBookings
                ? 'Pausar nuevas citas'
                : 'Volver a recibir citas'}
            </button>
            {!schedule.schedule.usesGlobalSchedule ? (
              <button className={styles.secondaryButton} onClick={inheritGlobal} type="button">
                Usar horario base
              </button>
            ) : (
              <span className={styles.inheritBadge}>Usando horario base</span>
            )}
          </div>
        ) : null}
        <div className={styles.weekGrid}>
          {days.map(([dayNumber, dayName]) => {
            const dayPeriods = periods
              .map((period, index) => ({ period, index }))
              .filter(({ period }) => period.dayOfWeek === dayNumber);
            return (
              <div className={styles.dayRow} key={dayNumber}>
                <div className={styles.dayName}>
                  <strong>{dayName}</strong>
                  <button onClick={() => addPeriod(dayNumber)} type="button">
                    + periodo
                  </button>
                </div>
                <div className={styles.dayPeriods}>
                  {dayPeriods.length === 0 ? (
                    <span className={styles.closedLabel}>Cerrado</span>
                  ) : null}
                  {dayPeriods.map(({ period, index }) => (
                    <div className={styles.periodRow} key={`${dayNumber}-${index}`}>
                      <select
                        aria-label={`Inicio ${dayName}`}
                        onChange={(event) =>
                          updatePeriod(index, 'startMinute', Number(event.target.value))
                        }
                        value={period.startMinute}
                      >
                        {timeOptions.slice(0, -1).map((minute) => (
                          <option key={minute} value={minute}>
                            {timeValue(minute)}
                          </option>
                        ))}
                      </select>
                      <span>a</span>
                      <select
                        aria-label={`Fin ${dayName}`}
                        onChange={(event) =>
                          updatePeriod(index, 'endMinute', Number(event.target.value))
                        }
                        value={period.endMinute}
                      >
                        {timeOptions.slice(1).map((minute) => (
                          <option key={minute} value={minute}>
                            {timeValue(minute)}
                          </option>
                        ))}
                      </select>
                      <button
                        aria-label={`Quitar periodo de ${dayName}`}
                        onClick={() => removePeriod(index)}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <button className={styles.primaryButton} onClick={saveWeekly} type="button">
          Guardar horario
        </button>
      </section>

      <aside className={styles.scheduleSide}>
        {error ? <div className={styles.error}>{error}</div> : null}
        {notice ? <div className={styles.success}>{notice}</div> : null}
        {warnings.length ? (
          <div className={styles.notice}>
            Este cambio deja {warnings.length} cita(s) fuera del nuevo horario. Se conservaron para
            que puedas decidir si las reprogramas.
          </div>
        ) : null}

        {!editingGlobal && schedule ? (
          <section className={styles.softCard}>
            <h2 className={styles.sectionTitle}>Fecha especial</h2>
            <p className={styles.compactCopy}>
              Cierra un día o publica un horario diferente sin cambiar toda la semana.
            </p>
            <form className={styles.form} onSubmit={saveOverride}>
              <div className={styles.field}>
                <label htmlFor="overrideDate">Fecha</label>
                <input
                  id="overrideDate"
                  onChange={(event) => setOverrideDate(event.target.value)}
                  required
                  type="date"
                  value={overrideDate}
                />
              </div>
              <label className={styles.checkbox}>
                <input
                  checked={overrideClosed}
                  onChange={(event) => setOverrideClosed(event.target.checked)}
                  type="checkbox"
                />
                Marcar el día completo como no disponible
              </label>
              {!overrideClosed ? (
                <div className={styles.periodRow}>
                  <select
                    onChange={(event) => setOverrideStart(Number(event.target.value))}
                    value={overrideStart}
                  >
                    {timeOptions.slice(0, -1).map((minute) => (
                      <option key={minute} value={minute}>
                        {timeValue(minute)}
                      </option>
                    ))}
                  </select>
                  <span>a</span>
                  <select
                    onChange={(event) => setOverrideEnd(Number(event.target.value))}
                    value={overrideEnd}
                  >
                    {timeOptions.slice(1).map((minute) => (
                      <option key={minute} value={minute}>
                        {timeValue(minute)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <button className={styles.secondaryButton} type="submit">
                Guardar fecha
              </button>
            </form>
            {schedule.overrides.length ? (
              <div className={styles.overrideList}>
                {schedule.overrides.map((item) => (
                  <div key={item.id}>
                    <span>
                      <strong>{databaseDateLabel(item.date)}</strong>
                      <small>{item.isClosed ? 'Cerrado' : 'Horario especial'}</small>
                    </span>
                    <button
                      aria-label={`Eliminar excepción del ${databaseDateLabel(item.date)}`}
                      onClick={() => void removeOverride(item)}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {editingGlobal && policy ? (
          <section className={styles.softCard}>
            <h2 className={styles.sectionTitle}>Reglas de reservación</h2>
            <form className={styles.form} onSubmit={savePolicy}>
              <div className={styles.gridTwo}>
                <div className={styles.field}>
                  <label htmlFor="defaultDurationMinutes">Duración base (min)</label>
                  <input
                    defaultValue={policy.defaultDurationMinutes}
                    id="defaultDurationMinutes"
                    min="15"
                    name="defaultDurationMinutes"
                    type="number"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="slotIntervalMinutes">Intervalo (min)</label>
                  <input
                    defaultValue={policy.slotIntervalMinutes}
                    id="slotIntervalMinutes"
                    min="15"
                    name="slotIntervalMinutes"
                    type="number"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="minimumLeadMinutes">Anticipación (min)</label>
                  <input
                    defaultValue={policy.minimumLeadMinutes}
                    id="minimumLeadMinutes"
                    min="0"
                    name="minimumLeadMinutes"
                    type="number"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="maximumAdvanceDays">Ventana (días)</label>
                  <input
                    defaultValue={policy.maximumAdvanceDays}
                    id="maximumAdvanceDays"
                    min="1"
                    name="maximumAdvanceDays"
                    type="number"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="holdMinutes">Apartado (min)</label>
                  <input
                    defaultValue={policy.holdMinutes}
                    id="holdMinutes"
                    min="1"
                    name="holdMinutes"
                    type="number"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="rescheduleNoticeHours">Cambio previo (h)</label>
                  <input
                    defaultValue={policy.rescheduleNoticeHours}
                    id="rescheduleNoticeHours"
                    min="0"
                    name="rescheduleNoticeHours"
                    type="number"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="clientRescheduleLimit">Cambios de clienta</label>
                  <input
                    defaultValue={policy.clientRescheduleLimit}
                    id="clientRescheduleLimit"
                    min="0"
                    name="clientRescheduleLimit"
                    type="number"
                  />
                </div>
              </div>
              <button className={styles.secondaryButton} type="submit">
                Guardar reglas
              </button>
            </form>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
