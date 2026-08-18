'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { DashboardReport } from '@/lib/api';
import styles from './admin-operations.module.css';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function dateKey(daysAgo = 0) {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Merida',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dateParam(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export function AdminDashboardPanel() {
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(() => dateParam(searchParams.get('from'), dateKey(29)));
  const [to, setTo] = useState(() => dateParam(searchParams.get('to'), dateKey()));
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(
        await apiFetch<DashboardReport>(`/admin/operations/dashboard?from=${from}&to=${to}`),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos abrir el resumen.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxDaily = useMemo(
    () => Math.max(1, ...(report?.daily.map((day) => day.total) ?? [1])),
    [report],
  );

  return (
    <div>
      <div className={styles.toolbar}>
        <label>
          Desde
          <input
            max={to}
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            value={from}
          />
        </label>
        <label>
          Hasta
          <input
            min={from}
            onChange={(event) => setTo(event.target.value)}
            type="date"
            value={to}
          />
        </label>
        <button disabled={loading} onClick={() => void load()} type="button">
          {loading ? 'Actualizando…' : 'Actualizar resumen'}
        </button>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      {!report && loading ? <div className={styles.loading}>Preparando tu resumen…</div> : null}
      {report ? (
        <>
          <section className={styles.metricGrid} aria-label="Indicadores del periodo">
            <Metric
              detail={`${report.appointments.upcoming} confirmadas`}
              label="Citas"
              value={report.appointments.total}
            />
            <Metric
              detail="citas terminadas"
              label="Atenciones"
              value={report.appointments.attended}
            />
            <Metric
              detail="ausencias registradas"
              label="No asistieron"
              value={report.appointments.noShows}
            />
            <Metric
              detail="comprobantes por revisar"
              label="Anticipos pendientes"
              value={report.deposits.pendingReview}
            />
            <Metric
              detail="anticipos aprobados"
              label="Reservado"
              value={money.format(report.deposits.approvedAmountCents / 100)}
            />
          </section>

          <div className={styles.dashboardGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Movimiento de la agenda</h2>
                  <p>Citas atendidas y canceladas por día en hora de Mérida.</p>
                </div>
              </div>
              <div className={styles.chart} aria-label="Gráfica diaria">
                {report.daily.map((day) => (
                  <div
                    className={styles.barGroup}
                    key={day.date}
                    title={`${day.date}: ${day.completed} atendidas, ${day.cancelled} canceladas o ausentes`}
                  >
                    <span
                      className={styles.bar}
                      style={{ height: `${Math.max(2, (day.completed / maxDaily) * 160)}px` }}
                    />
                    <span
                      className={styles.barCancelled}
                      style={{ height: `${Math.max(2, (day.cancelled / maxDaily) * 160)}px` }}
                    />
                  </div>
                ))}
              </div>
              <div className={styles.legend}>
                <span>Atendidas</span>
                <span>Canceladas o ausentes</span>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Clientes frecuentes</h2>
                  <p>Actividad dentro del periodo.</p>
                </div>
              </div>
              <ol className={styles.ranking}>
                {report.clients.frequent.map((client, index) => (
                  <li key={client.id}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{client.fullName}</strong>
                      <small>{client.globalVisitCount} visitas globales</small>
                    </div>
                    <em>{client.appointmentsInRange} citas</em>
                  </li>
                ))}
              </ol>
              {!report.clients.frequent.length ? (
                <div className={styles.empty}>Todavía no hay actividad en este periodo.</div>
              ) : null}
            </section>
          </div>

          <div className={styles.dashboardGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Diseños más reservados</h2>
                  <p>Se excluyen citas canceladas y vencidas.</p>
                </div>
              </div>
              <ol className={styles.ranking}>
                {report.designs.map((design, index) => (
                  <li key={design.id}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{design.title}</strong>
                      <small>
                        {design.technique} · {design.favorites} favoritos
                      </small>
                    </div>
                    <em>{design.appointmentsInRange} citas</em>
                  </li>
                ))}
              </ol>
              {!report.designs.length ? (
                <div className={styles.empty}>Aún no hay diseños reservados en estas fechas.</div>
              ) : null}
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Lectura rápida</h2>
                  <p>Datos que conviene revisar hoy.</p>
                </div>
              </div>
              <ol className={styles.ranking}>
                <li>
                  <span>+</span>
                  <div>
                    <strong>Nuevas clientas y clientes</strong>
                    <small>Registros del periodo</small>
                  </div>
                  <em>{report.clients.new}</em>
                </li>
                <li>
                  <span>×</span>
                  <div>
                    <strong>Cancelaciones</strong>
                    <small>Sin contar ausencias</small>
                  </div>
                  <em>{report.appointments.cancellations}</em>
                </li>
                <li>
                  <span>○</span>
                  <div>
                    <strong>Anticipos registrados</strong>
                    <small>Todos los estados</small>
                  </div>
                  <em>{report.deposits.total}</em>
                </li>
              </ol>
            </section>
          </div>

          <nav className={styles.quickLinks} aria-label="Herramientas de administración">
            <Link href={`/administracion/reportes?from=${from}&to=${to}`}>
              <span>Detalle</span>Consultar y exportar reportes
            </Link>
            <Link href={`/administracion/auditoria?from=${from}&to=${to}`}>
              <span>Control</span>Revisar historial de actividad
            </Link>
            <Link href="/administracion/configuracion">
              <span>Marca</span>Editar información pública
            </Link>
            <Link href="/agenda">
              <span>Operación</span>Abrir agenda del equipo
            </Link>
          </nav>
        </>
      ) : null}
    </div>
  );
}

function Metric({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: number | string;
}) {
  return (
    <article className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
