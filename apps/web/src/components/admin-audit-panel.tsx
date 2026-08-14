'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { AuditLogRow, ReportRange, UserRole } from '@/lib/api';
import styles from './admin-operations.module.css';

const actions: Record<string, string> = {
  APPOINTMENT_CREATED: 'Cita creada',
  APPOINTMENT_UPDATED: 'Cita modificada',
  APPOINTMENT_CANCELLED: 'Cita cancelada',
  APPOINTMENT_COMPLETED: 'Asistencia registrada',
  APPOINTMENT_NO_SHOW: 'Ausencia registrada',
  REPORT_EXPORTED: 'Reporte exportado',
  STUDIO_SETTINGS_UPDATED: 'Información pública modificada',
  STUDIO_LOGO_UPDATED: 'Logo modificado',
  STUDIO_ICON_UPDATED: 'Icono modificado',
  USER_CREATED: 'Cuenta creada',
  USER_UPDATED: 'Cuenta modificada',
  PAYMENT_REVIEWED: 'Anticipo revisado',
  DEPOSIT_REVIEWED: 'Anticipo revisado',
  REWARD_RULE_CREATED: 'Recompensa creada',
  REWARD_RULE_UPDATED: 'Recompensa modificada',
};
const roles: Record<UserRole, string> = {
  ADMIN: 'Administradora',
  NAIL_TECHNICIAN: 'Manicurista',
  CLIENT: 'Cliente',
};

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

export function AdminAuditPanel() {
  const [from, setFrom] = useState(() => dateKey(29));
  const [to, setTo] = useState(() => dateKey());
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [range, setRange] = useState<ReportRange | null>(null);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = new URLSearchParams({ from, to, page: String(page), pageSize: '30' });
  if (action) params.set('action', action);
  if (entityType) params.set('entityType', entityType);
  if (actorRole) params.set('actorRole', actorRole);
  const exportParams = new URLSearchParams(params);
  exportParams.delete('page');
  exportParams.delete('pageSize');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ from, to, page: String(page), pageSize: '30' });
    if (action) query.set('action', action);
    if (entityType) query.set('entityType', entityType);
    if (actorRole) query.set('actorRole', actorRole);
    try {
      const result = await apiFetch<{
        range: ReportRange;
        items: AuditLogRow[];
        pagination: { page: number; pages: number; total: number };
      }>(`/admin/operations/audit?${query}`);
      setItems(result.items);
      setRange(result.range);
      setPages(result.pagination.pages);
      setTotal(result.pagination.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos abrir la auditoría.');
    } finally {
      setLoading(false);
    }
  }, [action, actorRole, entityType, from, page, to]);

  useEffect(() => {
    void load();
  }, [load]);

  function apply() {
    if (page === 1) void load();
    else setPage(1);
  }

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
        <label>
          Acción
          <input
            onChange={(event) => setAction(event.target.value)}
            placeholder="Ej. APPOINTMENT"
            value={action}
          />
        </label>
        <label>
          Tipo de registro
          <input
            onChange={(event) => setEntityType(event.target.value)}
            placeholder="Ej. User"
            value={entityType}
          />
        </label>
        <label>
          Responsable
          <select onChange={(event) => setActorRole(event.target.value)} value={actorRole}>
            <option value="">Todas</option>
            <option value="ADMIN">Administradora</option>
            <option value="NAIL_TECHNICIAN">Manicuristas</option>
            <option value="CLIENT">Clientela</option>
          </select>
        </label>
        <button disabled={loading} onClick={apply} type="button">
          Aplicar filtros
        </button>
        <div className={styles.exportGroup}>
          <a
            className={styles.exportButton}
            download
            href={`/api/backend/admin/operations/reports/export/audit/csv?${exportParams}`}
          >
            CSV
          </a>
          <a
            className={styles.exportButton}
            download
            href={`/api/backend/admin/operations/reports/export/audit/xlsx?${exportParams}`}
          >
            Excel
          </a>
        </div>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.panelHeader}>
        <div>
          <h2>Actividad registrada</h2>
          <p>
            {range ? `${range.from} a ${range.to} · ${total} movimientos` : 'Consultando periodo…'}
          </p>
        </div>
      </div>
      {loading && !items.length ? (
        <div className={styles.loading}>Consultando movimientos…</div>
      ) : null}
      {!loading && !items.length ? (
        <div className={styles.empty}>No hay movimientos con estos filtros.</div>
      ) : null}
      {items.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Responsable</th>
                <th>Acción</th>
                <th>Registro</th>
                <th>Detalle técnico</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id}>
                  <td>{localDate(entry.createdAt)}</td>
                  <td>
                    <strong>{entry.actor?.fullName ?? 'Sistema'}</strong>
                    <br />
                    {entry.actor ? roles[entry.actor.role] : 'Proceso automático'}
                  </td>
                  <td>
                    <span className={styles.status}>
                      {actions[entry.action] ??
                        entry.action.replaceAll('_', ' ').toLocaleLowerCase('es-MX')}
                    </span>
                  </td>
                  <td>
                    {entry.entityType}
                    <br />
                    <small>{entry.entityId ?? 'Sin identificador'}</small>
                  </td>
                  <td>
                    {entry.metadata ? (
                      <details>
                        <summary>Ver datos</summary>
                        <pre>{JSON.stringify(entry.metadata, null, 2)}</pre>
                      </details>
                    ) : (
                      'Sin detalle'
                    )}
                    <br />
                    <small>IP: {entry.ipAddress ?? 'No disponible'}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {pages > 1 ? (
        <div className={styles.pagination}>
          <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">
            Anterior
          </button>
          <span>
            Página {page} de {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage((value) => value + 1)}
            type="button"
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </div>
  );
}
