'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { UserNotification } from '@/lib/api';
import portalStyles from './portal.module.css';
import styles from './notifications.module.css';

const icons = {
  APPOINTMENT: '♡',
  QUOTE: '✦',
  PAYMENT: '$',
  COUPON: '◇',
  REMINDER: '◷',
  SYSTEM: 'DA',
} as const;

export function NotificationsPanel() {
  const router = useRouter();
  const [items, setItems] = useState<UserNotification[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ items: UserNotification[] }>('/notifications')
      .then(({ items: loaded }) => setItems(loaded))
      .catch((reason) => {
        if (reason instanceof ApiError && reason.status === 401) router.replace('/acceso');
        else
          setError(
            reason instanceof Error ? reason.message : 'No pudimos abrir tus notificaciones.',
          );
      });
  }, [router]);

  async function markRead(id: string) {
    await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
    setItems(
      (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
        ) ?? null,
    );
    window.dispatchEvent(new Event('dearangel:session-changed'));
  }

  async function markAll() {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    const readAt = new Date().toISOString();
    setItems((current) => current?.map((item) => ({ ...item, readAt })) ?? null);
    window.dispatchEvent(new Event('dearangel:session-changed'));
  }

  if (error) return <div className={portalStyles.error}>{error}</div>;
  if (!items) return <div className={portalStyles.loading}>Abriendo tus avisos…</div>;
  const unread = items.filter((item) => !item.readAt).length;

  return (
    <div className={portalStyles.card}>
      <div className={styles.toolbar}>
        <p>{unread ? `${unread} sin leer` : 'Todo está al día'}</p>
        {unread ? (
          <button className={styles.allButton} onClick={markAll} type="button">
            Marcar todo como leído
          </button>
        ) : null}
      </div>
      {items.length ? (
        <div className={styles.list}>
          {items.map((item) => {
            const failed = item.deliveries.some((delivery) => delivery.status === 'FAILED');
            return (
              <article
                className={`${styles.item} ${!item.readAt ? styles.unread : ''}`}
                key={item.id}
              >
                <span aria-hidden="true" className={styles.icon}>
                  {icons[item.kind]}
                </span>
                <div className={styles.content}>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                  <div className={styles.meta}>
                    <time>
                      {new Date(item.createdAt).toLocaleString('es-MX', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </time>
                    {item.deliveries.map((delivery) => (
                      <span
                        className={delivery.status === 'FAILED' ? styles.deliveryFailed : ''}
                        key={delivery.id}
                      >
                        {delivery.channel === 'WHATSAPP' ? 'WhatsApp' : 'Correo'} ·{' '}
                        {delivery.status === 'SENT'
                          ? 'enviado'
                          : delivery.status === 'FAILED'
                            ? 'reintentando'
                            : 'pendiente'}
                      </span>
                    ))}
                  </div>
                  {item.actionUrl ? (
                    <Link
                      className={styles.action}
                      href={item.actionUrl}
                      onClick={() => !item.readAt && void markRead(item.id)}
                    >
                      Ver detalles →
                    </Link>
                  ) : null}
                  {failed ? (
                    <span className={styles.meta}>
                      El aviso permanece aquí aunque el canal externo esté reintentando.
                    </span>
                  ) : null}
                </div>
                {!item.readAt ? (
                  <button
                    className={styles.readButton}
                    onClick={() => markRead(item.id)}
                    type="button"
                  >
                    Marcar leído
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          Aquí aparecerán confirmaciones, cambios, recordatorios y beneficios.
        </div>
      )}
    </div>
  );
}
