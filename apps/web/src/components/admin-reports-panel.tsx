'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type {
  AppointmentReportRow,
  ClientReportRow,
  DepositReportRow,
  DesignReportRow,
  ReportRange,
  TechnicianSummary,
} from '@/lib/api';
import styles from './admin-operations.module.css';

type ReportTab = 'appointments' | 'deposits' | 'clients' | 'designs';
type ReportItem = AppointmentReportRow | DepositReportRow | ClientReportRow | DesignReportRow;

const tabs: Array<{ id: ReportTab; label: string }> = [
  { id: 'appointments', label: 'Citas' },
  { id: 'deposits', label: 'Anticipos' },
  { id: 'clients', label: 'Clientela frecuente' },
  { id: 'designs', label: 'Diseños populares' },
];

const appointmentStatuses: Array<[string, string]> = [
  ['HELD', 'Horario apartado'],
  ['PENDING_PAYMENT', 'Pago pendiente'],
  ['CONFIRMED', 'Confirmada'],
  ['CANCELLED', 'Cancelada'],
  ['COMPLETED', 'Atendida'],
  ['NO_SHOW', 'No asistió'],
  ['EXPIRED', 'Vencida'],
];
const depositStatuses: Array<[string, string]> = [
  ['AWAITING_RECEIPT', 'Sin comprobante'],
  ['PENDING_REVIEW', 'Por revisar'],
  ['APPROVED', 'Aprobado'],
  ['REJECTED', 'Rechazado'],
  ['EXPIRED', 'Vencido'],
  ['CANCELLED', 'Cancelado'],
];
const statusNames: Record<string, string> = Object.fromEntries([
  ...appointmentStatuses,
  ...depositStatuses,
]);
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

function localDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Merida',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AdminReportsPanel() {
  const [tab, setTab] = useState<ReportTab>('appointments');
  const [from, setFrom] = useState(() => dateKey(29));
  const [to, setTo] = useState(() => dateKey());
  const [status, setStatus] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [technicians, setTechnicians] = useState<Array<TechnicianSummary & { status: string }>>([]);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [range, setRange] = useState<ReportRange | null>(null);
  const [total, setTotal] = useState(0);
  const [amountCents, setAmountCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<{ items: Array<TechnicianSummary & { status: string }> }>(
      '/admin/operations/reports/technicians',
    )
      .then((result) => setTechnicians(result.items))
      .catch(() => undefined);
  }, []);

  const query = new URLSearchParams({ from, to });
  if (status && (tab === 'appointments' || tab === 'deposits')) query.set('status', status);
  if (technicianId && tab === 'appointments') query.set('technicianId', technicianId);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ from, to });
    if (status && (tab === 'appointments' || tab === 'deposits')) params.set('status', status);
    if (technicianId && tab === 'appointments') params.set('technicianId', technicianId);
    try {
      const result = await apiFetch<{
        range: ReportRange;
        items: ReportItem[];
        total: number;
        amountCents?: number;
      }>(`/admin/operations/reports/${tab}?${params}`);
      setItems(result.items);
      setRange(result.range);
      setTotal(result.total);
      setAmountCents(result.amountCents ?? 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos generar el reporte.');
    } finally {
      setLoading(false);
    }
  }, [from, status, tab, technicianId, to]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectTab(next: ReportTab) {
    setTab(next);
    setStatus('');
    setTechnicianId('');
  }

  return (
    <div>
      <div className={styles.tabs} role="tablist">
        {tabs.map((item) => (
          <button
            aria-selected={tab === item.id}
            className={tab === item.id ? styles.activeTab : ''}
            key={item.id}
            onClick={() => selectTab(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
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
        {tab === 'appointments' || tab === 'deposits' ? (
          <label>
            Estado
            <select onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="">Todos</option>
              {(tab === 'appointments' ? appointmentStatuses : depositStatuses).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>
        ) : null}
        {tab === 'appointments' ? (
          <label>
            Manicurista
            <select onChange={(event) => setTechnicianId(event.target.value)} value={technicianId}>
              <option value="">Todas</option>
              {technicians.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName}
                  {item.status === 'PAUSED' ? ' · en pausa' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button disabled={loading} onClick={() => void load()} type="button">
          Aplicar filtros
        </button>
        <div className={styles.exportGroup}>
          <a
            className={styles.exportButton}
            download
            href={`/api/backend/admin/operations/reports/export/${tab}/csv?${query}`}
          >
            CSV
          </a>
          <a
            className={styles.exportButton}
            download
            href={`/api/backend/admin/operations/reports/export/${tab}/xlsx?${query}`}
          >
            Excel
          </a>
        </div>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.panelHeader}>
        <div>
          <h2>{tabs.find((item) => item.id === tab)?.label}</h2>
          <p>
            {range ? `${range.from} a ${range.to} · ${total} registros` : 'Selecciona un periodo.'}
            {tab === 'deposits' ? ` · ${money.format(amountCents / 100)} aprobado` : ''}
          </p>
        </div>
      </div>
      {loading && !items.length ? <div className={styles.loading}>Consultando datos…</div> : null}
      {!loading && !items.length ? (
        <div className={styles.empty}>No hay registros con estos filtros.</div>
      ) : null}
      {items.length ? <ReportTable items={items} tab={tab} /> : null}
    </div>
  );
}

function ReportTable({ items, tab }: { items: ReportItem[]; tab: ReportTab }) {
  if (tab === 'appointments') {
    return (
      <Table
        headers={['Fecha', 'Cliente', 'Manicurista', 'Estado', 'Duración', 'Diseño', 'Anticipo']}
        rows={(items as AppointmentReportRow[]).map((item) => [
          localDate(item.startAt),
          item.client?.fullName ?? item.guestName ?? 'Sin nombre',
          item.technician.fullName,
          <Status key="s" value={item.status} />,
          `${item.durationMinutes} min`,
          item.design?.title ?? 'Por definir',
          item.deposit ? statusNames[item.deposit.status] : 'No aplica',
        ])}
      />
    );
  }
  if (tab === 'deposits') {
    return (
      <Table
        headers={['Cita', 'Referencia', 'Cliente', 'Manicurista', 'Estado', 'Monto', 'Revisión']}
        rows={(items as DepositReportRow[]).map((item) => [
          localDate(item.appointment.startAt),
          item.reference,
          item.appointment.client?.fullName ?? 'Sin cuenta',
          item.appointment.technician.fullName,
          <Status key="s" value={item.status} />,
          money.format(item.amountCents / 100),
          item.reviewedAt ? localDate(item.reviewedAt) : 'Pendiente',
        ])}
      />
    );
  }
  if (tab === 'clients') {
    return (
      <Table
        headers={[
          'Cliente',
          'Teléfono',
          'Citas del periodo',
          'Atendidas',
          'Visitas globales',
          'Registro',
        ]}
        rows={(items as ClientReportRow[]).map((item) => [
          item.fullName,
          item.phone ?? 'Sin teléfono',
          item.appointmentsInRange,
          item.completedInRange,
          item.globalVisitCount,
          localDate(item.createdAt),
        ])}
      />
    );
  }
  return (
    <Table
      headers={['Diseño', 'Técnica', 'Citas', 'Favoritos', 'Precio', 'Duración', 'Estado']}
      rows={(items as DesignReportRow[]).map((item) => [
        item.title,
        item.technique,
        item.appointmentsInRange,
        item.favorites,
        money.format(item.priceCents / 100),
        `${item.durationMinutes} min`,
        item.published ? 'Publicado' : 'Oculto',
      ])}
    />
  );
}

function Status({ value }: { value: string }) {
  return <span className={styles.status}>{statusNames[value] ?? value}</span>;
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
