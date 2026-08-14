'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { Appointment, AppointmentStatus, CurrentUser, TechnicianSummary } from '@/lib/api';
import { meridaLocalToIso } from '@/lib/business-time';
import styles from './portal.module.css';

const statusLabels: Record<AppointmentStatus, string> = {
  HELD: 'Apartada',
  PENDING_PAYMENT: 'Pago por revisar',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Atendida',
  NO_SHOW: 'No asistió',
  EXPIRED: 'Apartado vencido',
};

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Merida',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AppointmentsPanel() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAppointments = useCallback(async () => {
    const response = await apiFetch<{ items: Appointment[] }>('/appointments');
    setAppointments(response.items);
  }, []);

  useEffect(() => {
    apiFetch<{ user: CurrentUser }>('/auth/me')
      .then(async ({ user: currentUser }) => {
        setUser(currentUser);
        if (currentUser.role === 'ADMIN') {
          const team = await apiFetch<{ items: TechnicianSummary[] }>('/scheduling/technicians');
          setTechnicians(team.items);
        }
        await loadAppointments();
      })
      .catch(() => router.replace('/acceso'))
      .finally(() => setLoading(false));
  }, [loadAppointments, router]);

  async function createManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const rawDate = data.get('startAt');
      if (typeof rawDate !== 'string') throw new Error('Selecciona una fecha y hora.');
      await apiFetch('/appointments/manual', {
        method: 'POST',
        body: JSON.stringify({
          technicianId: data.get('technicianId') || undefined,
          clientPhone: data.get('phone') || undefined,
          guestName: data.get('name') || undefined,
          guestPhone: data.get('phone') || undefined,
          startAt: meridaLocalToIso(rawDate),
          durationMinutes: Number(data.get('durationMinutes')),
          notes: data.get('notes') || undefined,
        }),
      });
      form.reset();
      setNotice('La cita manual quedó confirmada y el horario ya está bloqueado.');
      await loadAppointments();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos crear la cita.');
    }
  }

  async function updateStatus(appointment: Appointment, status: AppointmentStatus) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/appointments/${appointment.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setNotice(`La cita ahora aparece como ${statusLabels[status].toLowerCase()}.`);
      await loadAppointments();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos actualizar la cita.');
    }
  }

  async function cancel(appointment: Appointment) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/appointments/${appointment.id}/cancel`, { method: 'PATCH' });
      setNotice('La cita fue cancelada. El anticipo no es reembolsable.');
      await loadAppointments();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos cancelar la cita.');
    }
  }

  async function reschedule(event: FormEvent<HTMLFormElement>, appointment: Appointment) {
    event.preventDefault();
    setError('');
    setNotice('');
    const data = new FormData(event.currentTarget);
    try {
      const rawDate = data.get('startAt');
      if (typeof rawDate !== 'string') throw new Error('Selecciona una fecha y hora.');
      await apiFetch(`/appointments/${appointment.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ startAt: meridaLocalToIso(rawDate) }),
      });
      setEditingId('');
      setNotice(
        user?.role === 'CLIENT'
          ? 'Tu cita quedó reprogramada. Recuerda que puedes hacerlo una sola vez.'
          : 'La cita quedó reprogramada sin consumir el cambio de la clienta.',
      );
      await loadAppointments();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos reprogramar la cita.');
    }
  }

  if (loading || !user) return <div className={styles.loading}>Abriendo la agenda…</div>;
  const isStaff = user.role !== 'CLIENT';

  return (
    <div className={styles.agendaLayout}>
      {isStaff ? (
        <section className={styles.softCard}>
          <span className={styles.eyebrow}>Cita directa</span>
          <h2 className={styles.sectionTitle}>Agregar a la agenda</h2>
          <p className={styles.compactCopy}>
            Acepta cualquier minuto, pero respeta tu disponibilidad y nunca se encimará con otra
            cita.
          </p>
          <form className={styles.form} onSubmit={createManual}>
            {user.role === 'ADMIN' ? (
              <div className={styles.field}>
                <label htmlFor="manualTechnician">Manicurista</label>
                <select id="manualTechnician" name="technicianId" required>
                  <option value="">Seleccionar…</option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.fullName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className={styles.field}>
              <label htmlFor="manualName">Nombre de la clienta</label>
              <input id="manualName" name="name" required />
            </div>
            <div className={styles.field}>
              <label htmlFor="manualPhone">WhatsApp</label>
              <input id="manualPhone" name="phone" placeholder="999 000 0000" />
            </div>
            <div className={styles.gridTwo}>
              <div className={styles.field}>
                <label htmlFor="manualStart">Fecha y hora</label>
                <input id="manualStart" name="startAt" required type="datetime-local" />
              </div>
              <div className={styles.field}>
                <label htmlFor="manualDuration">Duración</label>
                <input
                  defaultValue="60"
                  id="manualDuration"
                  max="720"
                  min="15"
                  name="durationMinutes"
                  required
                  step="5"
                  type="number"
                />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="manualNotes">Notas o diseño</label>
              <input
                id="manualNotes"
                name="notes"
                placeholder="Ej. francesa lila, referencia por WhatsApp"
              />
            </div>
            <button className={styles.primaryButton} type="submit">
              Crear cita confirmada
            </button>
          </form>
        </section>
      ) : (
        <section className={styles.softCard}>
          <span className={styles.eyebrow}>Tu próximo momento</span>
          <h2 className={styles.sectionTitle}>Reserva con calma</h2>
          <p className={styles.compactCopy}>
            Elige una manicurista, revisa horas reales y aparta tu espacio desde aquí.
          </p>
          <Link className={styles.primaryLink} href="/reservar">
            Buscar un horario
          </Link>
        </section>
      )}

      <section>
        <div className={styles.toolbar}>
          <div>
            <span className={styles.eyebrow}>{isStaff ? 'Operación diaria' : 'Mi historial'}</span>
            <h2 className={styles.sectionTitle}>Citas · {appointments.length}</h2>
          </div>
          <Link className={styles.textLink} href="/mi-cuenta">
            Volver a mi cuenta
          </Link>
        </div>
        {error ? <div className={styles.error}>{error}</div> : null}
        {notice ? <div className={styles.success}>{notice}</div> : null}
        <div className={styles.appointmentList}>
          {appointments.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>Aún no hay citas.</strong>
              <span>Las nuevas reservaciones aparecerán aquí en tiempo real.</span>
            </div>
          ) : null}
          {appointments.map((appointment) => {
            const canChange = ['HELD', 'PENDING_PAYMENT', 'CONFIRMED'].includes(appointment.status);
            return (
              <article className={styles.appointmentCard} key={appointment.id}>
                <div className={styles.appointmentDate}>
                  <strong>{dateTimeLabel(appointment.startAt)}</strong>
                  <span>{appointment.durationMinutes} minutos</span>
                </div>
                <div className={styles.appointmentPeople}>
                  <span>
                    {isStaff
                      ? (appointment.client?.fullName ??
                        appointment.guest?.name ??
                        'Cliente sin cuenta')
                      : appointment.technician.fullName}
                  </span>
                  <small>{appointment.notes ?? 'Sin notas'}</small>
                  {isStaff && (appointment.client?.availableCouponCount ?? 0) > 0 ? (
                    <Link className={styles.textLink} href="/recompensas/equipo">
                      Tiene {appointment.client?.availableCouponCount} cupón(es) disponible(s)
                    </Link>
                  ) : null}
                </div>
                <span className={styles.badge}>{statusLabels[appointment.status]}</span>
                {editingId === appointment.id ? (
                  <form
                    className={styles.inlineForm}
                    onSubmit={(event) => reschedule(event, appointment)}
                  >
                    <input name="startAt" required type="datetime-local" />
                    <button type="submit">Guardar cambio</button>
                    <button onClick={() => setEditingId('')} type="button">
                      Cerrar
                    </button>
                  </form>
                ) : null}
                {canChange ? (
                  <div className={styles.userActions}>
                    <button onClick={() => setEditingId(appointment.id)} type="button">
                      Reprogramar
                    </button>
                    <button onClick={() => cancel(appointment)} type="button">
                      Cancelar
                    </button>
                    {user.role === 'ADMIN' && appointment.status === 'PENDING_PAYMENT' ? (
                      <Link className={styles.textLink} href="/administracion/anticipos">
                        Revisar comprobante
                      </Link>
                    ) : null}
                    {user.role === 'CLIENT' && appointment.status === 'HELD' ? (
                      <Link
                        className={styles.textLink}
                        href={`/anticipo?appointmentId=${appointment.id}`}
                      >
                        Enviar anticipo
                      </Link>
                    ) : null}
                    {user.role === 'CLIENT' && appointment.deposit?.status === 'APPROVED' ? (
                      <Link
                        className={styles.textLink}
                        href={`/anticipo?appointmentId=${appointment.id}`}
                      >
                        Ver comprobante digital
                      </Link>
                    ) : null}
                    {isStaff && appointment.status === 'CONFIRMED' ? (
                      <>
                        <button
                          onClick={() => updateStatus(appointment, 'COMPLETED')}
                          type="button"
                        >
                          Marcar atendida
                        </button>
                        <button onClick={() => updateStatus(appointment, 'NO_SHOW')} type="button">
                          No asistió
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
