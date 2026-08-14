'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { Appointment, ClientCoupon, CurrentUser, LoyaltyProfile } from '@/lib/api';
import { LoyaltyJourney } from './loyalty-journey';
import styles from './loyalty.module.css';
import portal from './portal.module.css';

interface ClientSummary {
  id: string;
  fullName: string;
  phone: string | null;
  visitCount: number;
  availableCouponCount: number;
}

export function StaffLoyaltyPanel() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [profile, setProfile] = useState<LoyaltyProfile | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadClients = useCallback(async (term = '') => {
    const query = term.trim() ? `?search=${encodeURIComponent(term.trim())}` : '';
    const result = await apiFetch<{ items: ClientSummary[] }>(`/loyalty/clients${query}`);
    setClients(result.items);
  }, []);

  const loadProfile = useCallback(async (clientId: string) => {
    const result = await apiFetch<LoyaltyProfile>(`/loyalty/clients/${clientId}`);
    setProfile(result);
  }, []);

  useEffect(() => {
    apiFetch<{ user: CurrentUser }>('/auth/me')
      .then(async ({ user: current }) => {
        if (current.role === 'CLIENT') throw new Error('Sin permisos');
        setUser(current);
        await Promise.all([
          loadClients(),
          apiFetch<{ items: Appointment[] }>('/appointments').then((result) =>
            setAppointments(result.items),
          ),
        ]);
      })
      .catch(() => router.replace('/acceso'));
  }, [loadClients, router]);

  const clientAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          appointment.client?.id === selectedId &&
          ['CONFIRMED', 'COMPLETED'].includes(appointment.status),
      ),
    [appointments, selectedId],
  );

  async function selectClient(clientId: string) {
    setSelectedId(clientId);
    setError('');
    setNotice('');
    await loadProfile(clientId);
  }

  async function redeem(coupon: ClientCoupon, appointmentId: string) {
    if (!appointmentId) {
      setError('Selecciona la cita donde se aplicó el descuento.');
      return;
    }
    setError('');
    setNotice('');
    try {
      await apiFetch(`/loyalty/coupons/${coupon.id}/redeem`, {
        method: 'POST',
        body: JSON.stringify({ appointmentId }),
      });
      setNotice('Cupón marcado como utilizado. El cobro se realiza físicamente.');
      await Promise.all([loadProfile(selectedId), loadClients(search)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos canjear el cupón.');
    }
  }

  async function reverse(coupon: ClientCoupon) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/loyalty/coupons/${coupon.id}/reverse`, { method: 'POST' });
      setNotice('El canje fue revertido y el cupón volvió a estar disponible.');
      await Promise.all([loadProfile(selectedId), loadClients(search)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos revertirlo.');
    }
  }

  if (!user) return <div className={portal.loading}>Abriendo recompensas…</div>;
  return (
    <div className={styles.staffLayout}>
      <aside className={styles.searchBox}>
        <input
          aria-label="Buscar clienta"
          onChange={(event) => {
            setSearch(event.target.value);
            void loadClients(event.target.value);
          }}
          placeholder="Nombre o WhatsApp"
          value={search}
        />
        <div className={styles.clientList}>
          {clients.map((client) => (
            <button
              className={`${styles.clientButton} ${selectedId === client.id ? styles.selectedClient : ''}`}
              key={client.id}
              onClick={() => selectClient(client.id)}
              type="button"
            >
              <div>
                <strong>{client.fullName}</strong>
                <small>
                  {client.phone ?? 'Sin teléfono'} · {client.visitCount} visitas
                </small>
              </div>
              <span>{client.availableCouponCount} cupón(es)</span>
            </button>
          ))}
        </div>
      </aside>
      <section className={styles.staffProfile}>
        {error ? <div className={portal.error}>{error}</div> : null}
        {notice ? <div className={portal.success}>{notice}</div> : null}
        {!profile ? (
          <div className={portal.loading}>
            Selecciona una clienta para consultar sus beneficios.
          </div>
        ) : (
          <>
            <h2>{profile.client.fullName}</h2>
            {profile.availableCouponCount > 0 ? (
              <div className={portal.notice}>
                Esta clienta tiene {profile.availableCouponCount} cupón(es) disponible(s).
                Recuérdale que puede usar uno.
              </div>
            ) : null}
            <div className={styles.couponSection}>
              <div className={styles.adminList}>
                {profile.coupons
                  .filter((coupon) => coupon.status === 'AVAILABLE')
                  .map((coupon) => (
                    <div className={styles.redeemRow} key={coupon.id}>
                      <div>
                        <strong>
                          {coupon.iconText} {coupon.title}
                        </strong>
                        <small>{coupon.description}</small>
                      </div>
                      <select
                        aria-label={`Cita para ${coupon.title}`}
                        defaultValue=""
                        id={`appointment-${coupon.id}`}
                      >
                        <option value="">Seleccionar cita…</option>
                        {clientAppointments.map((appointment) => (
                          <option key={appointment.id} value={appointment.id}>
                            {new Date(appointment.startAt).toLocaleDateString('es-MX')} ·{' '}
                            {appointment.technician.fullName}
                          </option>
                        ))}
                      </select>
                      <button
                        className={portal.primaryButton}
                        onClick={() =>
                          redeem(
                            coupon,
                            (
                              document.getElementById(
                                `appointment-${coupon.id}`,
                              ) as HTMLSelectElement
                            ).value,
                          )
                        }
                        type="button"
                      >
                        Canjear
                      </button>
                    </div>
                  ))}
              </div>
            </div>
            {user.role === 'ADMIN' ? (
              <div className={styles.historySection}>
                <span className={styles.sectionLabel}>Control administrativo</span>
                <h2>Canjes utilizados</h2>
                <div className={styles.adminList}>
                  {profile.coupons
                    .filter((coupon) => coupon.status === 'REDEEMED')
                    .map((coupon) => (
                      <div className={styles.adminItem} key={coupon.id}>
                        <div>
                          <strong>{coupon.title}</strong>
                          <small>
                            {coupon.redeemedAt
                              ? new Date(coupon.redeemedAt).toLocaleDateString('es-MX')
                              : ''}
                          </small>
                        </div>
                        <button onClick={() => reverse(coupon)} type="button">
                          Revertir canje
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
            <LoyaltyJourney compact profile={profile} />
          </>
        )}
      </section>
    </div>
  );
}
