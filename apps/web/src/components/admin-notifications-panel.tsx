'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser } from '@/lib/api';
import styles from './portal.module.css';

interface Template {
  key: string;
  label: string;
  titleTemplate: string;
  bodyTemplate: string;
  whatsappTemplateName: string | null;
  active: boolean;
}

interface DeliveryReport {
  counts: Array<{ status: string; _count: { _all: number } }>;
  failures: Array<{
    id: string;
    channel: string;
    attempts: number;
    lastError: string | null;
    nextAttemptAt: string;
    notification: { title: string; user: { fullName: string } };
  }>;
}

export function AdminNotificationsPanel() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [report, setReport] = useState<DeliveryReport | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const [{ user }, loadedTemplates, loadedReport] = await Promise.all([
        apiFetch<{ user: CurrentUser }>('/auth/me'),
        apiFetch<Template[]>('/admin/notifications/templates'),
        apiFetch<DeliveryReport>('/admin/notifications/deliveries'),
      ]);
      if (user.role !== 'ADMIN') return router.replace('/mi-cuenta');
      setTemplates(loadedTemplates);
      setReport(loadedReport);
    } catch {
      router.replace('/acceso');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>, template: Template) {
    event.preventDefault();
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch(`/admin/notifications/templates/${template.key}`, {
        method: 'PATCH',
        body: JSON.stringify({
          label: data.get('label'),
          titleTemplate: data.get('titleTemplate'),
          bodyTemplate: data.get('bodyTemplate'),
          whatsappTemplateName: data.get('whatsappTemplateName') || undefined,
          active: data.get('active') === 'on',
        }),
      });
      setMessage(`Guardamos la plantilla “${template.label}”.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar la plantilla.');
    }
  }

  if (!templates || !report)
    return <div className={styles.loading}>Abriendo configuración de avisos…</div>;

  return (
    <div className={styles.form}>
      <section className={styles.card}>
        <h2>Estado de entregas</h2>
        <div className={styles.accountNavigation}>
          {report.counts.map((count) => (
            <article className={styles.accountNavCard} key={count.status}>
              <span>{labelStatus(count.status)}</span>
              <strong>{count._count._all}</strong>
            </article>
          ))}
        </div>
        {report.failures.length ? (
          <details className={styles.securityDetails}>
            <summary>
              <span>Errores de entrega</span>
              <strong>{report.failures.length} entregas con error</strong>
            </summary>
            <div className={styles.securityContent}>
              {report.failures.map((failure) => (
                <p className={styles.fieldHint} key={failure.id}>
                  <strong>{failure.notification.user.fullName}</strong> ·{' '}
                  {failure.notification.title} ·{' '}
                  {failure.attempts >= 5
                    ? 'se agotaron los 5 intentos'
                    : `reintento ${failure.attempts + 1}/5 programado`}
                  <br />
                  {failure.lastError}
                </p>
              ))}
            </div>
          </details>
        ) : (
          <div className={styles.success}>No hay entregas externas con error.</div>
        )}
      </section>
      {message ? <div className={styles.success}>{message}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      {templates.map((template) => (
        <form
          className={styles.card}
          key={template.key}
          onSubmit={(event) => save(event, template)}
        >
          <div className={styles.gridTwo}>
            <div className={styles.field}>
              <label htmlFor={`label-${template.key}`}>Nombre interno</label>
              <input
                defaultValue={template.label}
                id={`label-${template.key}`}
                name="label"
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`wa-${template.key}`}>Nombre aprobado en Meta</label>
              <input
                defaultValue={template.whatsappTemplateName ?? ''}
                id={`wa-${template.key}`}
                name="whatsappTemplateName"
                placeholder="dear_angel_recordatorio"
              />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor={`title-${template.key}`}>Título</label>
            <input
              defaultValue={template.titleTemplate}
              id={`title-${template.key}`}
              name="titleTemplate"
              required
            />
            <span className={styles.fieldHint}>
              Usa {'{{titulo}}'} para conservar el título específico del aviso.
            </span>
          </div>
          <div className={styles.field}>
            <label htmlFor={`body-${template.key}`}>Mensaje</label>
            <input
              defaultValue={template.bodyTemplate}
              id={`body-${template.key}`}
              name="bodyTemplate"
              required
            />
            <span className={styles.fieldHint}>
              Usa {'{{mensaje}}'} para conservar los detalles de la cita, anticipo o cupón.
            </span>
          </div>
          <label className={styles.checkbox}>
            <input defaultChecked={template.active} name="active" type="checkbox" />
            Usar esta plantilla
          </label>
          <button className={styles.primaryButton} type="submit">
            Guardar plantilla
          </button>
        </form>
      ))}
    </div>
  );
}

function labelStatus(status: string) {
  return (
    (
      {
        PENDING: 'Pendientes',
        PROCESSING: 'En proceso',
        SENT: 'Aceptados por proveedor',
        FAILED: 'Con error',
        SKIPPED: 'Omitidos',
      } as Record<string, string>
    )[status] ?? status
  );
}
