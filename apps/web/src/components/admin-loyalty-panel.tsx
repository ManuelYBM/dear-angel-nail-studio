'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser, LoyaltyProfile, Promotion, RewardRule } from '@/lib/api';
import styles from './loyalty.module.css';
import portal from './portal.module.css';

interface ClientSummary {
  id: string;
  fullName: string;
  phone: string | null;
  visitCount: number;
  availableCouponCount: number;
}

export function AdminLoyaltyPanel() {
  const router = useRouter();
  const [rules, setRules] = useState<RewardRule[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);
  const [clientProfile, setClientProfile] = useState<LoyaltyProfile | null>(null);
  const [editingRule, setEditingRule] = useState<RewardRule | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [configuration, clientResult] = await Promise.all([
      apiFetch<{ rules: RewardRule[]; promotions: Promotion[] }>('/admin/loyalty'),
      apiFetch<{ items: ClientSummary[] }>('/loyalty/clients'),
    ]);
    setRules(configuration.rules);
    setPromotions(configuration.promotions);
    setClients(clientResult.items);
  }, []);

  useEffect(() => {
    apiFetch<{ user: CurrentUser }>('/auth/me')
      .then(({ user }) => {
        if (user.role !== 'ADMIN') throw new Error('Sin permisos');
        return load();
      })
      .catch(() => router.replace('/acceso'));
  }, [load, router]);

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const payload = {
        visitNumber: Number(data.get('visitNumber')),
        title: data.get('title'),
        description: data.get('description'),
        iconText: data.get('iconText'),
        active: data.get('active') === 'on',
      };
      await apiFetch(
        editingRule ? `/admin/loyalty/rules/${editingRule.id}` : '/admin/loyalty/rules',
        { method: editingRule ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      );
      setEditingRule(null);
      form.reset();
      setNotice('Recompensa guardada y clientas elegibles actualizadas.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar la recompensa.');
    }
  }

  async function savePromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const payload = {
        code: data.get('code'),
        title: data.get('title'),
        description: data.get('description'),
        iconText: data.get('iconText'),
        active: data.get('active') === 'on',
      };
      await apiFetch(
        editingPromotion
          ? `/admin/loyalty/promotions/${editingPromotion.id}`
          : '/admin/loyalty/promotions',
        { method: editingPromotion ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      );
      setEditingPromotion(null);
      form.reset();
      setNotice('Promoción guardada.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar la promoción.');
    }
  }

  async function chooseClient(client: ClientSummary) {
    setSelectedClient(client);
    setClientProfile(await apiFetch<LoyaltyProfile>(`/loyalty/clients/${client.id}`));
  }

  async function correctVisits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClient) return;
    setError('');
    setNotice('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await apiFetch(`/loyalty/clients/${selectedClient.id}/visits/correction`, {
        method: 'POST',
        body: JSON.stringify({
          visitCount: Number(data.get('visitCount')),
          note: data.get('note'),
        }),
      });
      setNotice('Contador corregido y movimiento guardado en auditoría.');
      await load();
      await chooseClient({ ...selectedClient, visitCount: Number(data.get('visitCount')) });
      form.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos corregir las visitas.');
    }
  }

  async function issuePromotion(promotion: Promotion) {
    if (!selectedClient) {
      setError('Selecciona primero una clienta.');
      return;
    }
    try {
      await apiFetch(`/admin/loyalty/promotions/${promotion.id}/issue`, {
        method: 'PATCH',
        body: JSON.stringify({ clientId: selectedClient.id }),
      });
      setNotice(`“${promotion.title}” se agregó a ${selectedClient.fullName}.`);
      await chooseClient(selectedClient);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos entregar la promoción.');
    }
  }

  return (
    <div>
      {error ? <div className={portal.error}>{error}</div> : null}
      {notice ? <div className={portal.success}>{notice}</div> : null}
      <div className={styles.adminLayout}>
        <section className={styles.adminColumn}>
          <form
            className={styles.adminForm}
            key={editingRule?.id ?? 'new-rule'}
            onSubmit={saveRule}
          >
            <h2>{editingRule ? 'Editar recompensa' : 'Nueva recompensa'}</h2>
            <label>
              Número de visita
              <input
                defaultValue={editingRule?.visitNumber ?? ''}
                min="1"
                name="visitNumber"
                required
                type="number"
              />
            </label>
            <label>
              Título
              <input defaultValue={editingRule?.title ?? ''} name="title" required />
            </label>
            <label>
              Descripción
              <textarea
                defaultValue={editingRule?.description ?? ''}
                name="description"
                required
                rows={3}
              />
            </label>
            <label>
              Icono o emoji
              <input defaultValue={editingRule?.iconText ?? '✦'} name="iconText" required />
            </label>
            <label>
              <span>
                <input defaultChecked={editingRule?.active ?? true} name="active" type="checkbox" />{' '}
                Activa
              </span>
            </label>
            <button className={portal.primaryButton} type="submit">
              Guardar recompensa
            </button>
          </form>
          <div className={styles.adminList}>
            {rules.map((rule) => (
              <div className={styles.adminItem} key={rule.id}>
                <div>
                  <strong>
                    {rule.iconText} Visita {rule.visitNumber} · {rule.title}
                  </strong>
                  <small>
                    {rule.description} · {rule.active ? 'Activa' : 'Oculta'}
                  </small>
                </div>
                <button onClick={() => setEditingRule(rule)} type="button">
                  Editar
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className={styles.adminColumn}>
          <form
            className={styles.adminForm}
            key={editingPromotion?.id ?? 'new-promotion'}
            onSubmit={savePromotion}
          >
            <h2>{editingPromotion ? 'Editar promoción' : 'Nueva promoción general'}</h2>
            <label>
              Código
              <input
                defaultValue={editingPromotion?.code ?? ''}
                name="code"
                placeholder="CUMPLE10"
                required
              />
            </label>
            <label>
              Título
              <input defaultValue={editingPromotion?.title ?? ''} name="title" required />
            </label>
            <label>
              Descripción
              <textarea
                defaultValue={editingPromotion?.description ?? ''}
                name="description"
                required
                rows={3}
              />
            </label>
            <label>
              Icono o emoji
              <input defaultValue={editingPromotion?.iconText ?? '♡'} name="iconText" required />
            </label>
            <label>
              <span>
                <input
                  defaultChecked={editingPromotion?.active ?? true}
                  name="active"
                  type="checkbox"
                />{' '}
                Activa
              </span>
            </label>
            <button className={portal.primaryButton} type="submit">
              Guardar promoción
            </button>
          </form>
          <div className={styles.adminList}>
            {promotions.map((promotion) => (
              <div className={styles.adminItem} key={promotion.id}>
                <div>
                  <strong>
                    {promotion.iconText} {promotion.title}
                  </strong>
                  <small>
                    {promotion.code} · {promotion.active ? 'Activa' : 'Desactivada'}
                  </small>
                </div>
                <div>
                  <button onClick={() => setEditingPromotion(promotion)} type="button">
                    Editar
                  </button>
                  {promotion.active ? (
                    <button onClick={() => issuePromotion(promotion)} type="button">
                      Entregar
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className={styles.historySection}>
        <span className={styles.sectionLabel}>Clientas</span>
        <h2>Visitas y promociones manuales</h2>
        <div className={styles.staffLayout}>
          <div className={styles.clientList}>
            {clients.map((client) => (
              <button
                className={`${styles.clientButton} ${selectedClient?.id === client.id ? styles.selectedClient : ''}`}
                key={client.id}
                onClick={() => chooseClient(client)}
                type="button"
              >
                <div>
                  <strong>{client.fullName}</strong>
                  <small>
                    {client.phone} · {client.visitCount} visitas
                  </small>
                </div>
                <span>{client.availableCouponCount} cupón(es)</span>
              </button>
            ))}
          </div>
          <div className={styles.staffProfile}>
            {!selectedClient || !clientProfile ? (
              <p>Selecciona una clienta para corregir su contador o entregarle una promoción.</p>
            ) : (
              <>
                <h2>{selectedClient.fullName}</h2>
                <p>
                  {clientProfile.visitCount} visitas · {clientProfile.availableCouponCount} cupones
                  disponibles
                </p>
                <form className={styles.adminForm} onSubmit={correctVisits}>
                  <label>
                    Nuevo total de visitas
                    <input
                      defaultValue={clientProfile.visitCount}
                      min="0"
                      name="visitCount"
                      required
                      type="number"
                    />
                  </label>
                  <label>
                    Motivo de la corrección
                    <textarea
                      name="note"
                      placeholder="Explica por qué se realiza el ajuste"
                      required
                      rows={3}
                    />
                  </label>
                  <button className={portal.secondaryButton} type="submit">
                    Corregir contador
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
