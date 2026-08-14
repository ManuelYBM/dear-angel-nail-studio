'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { StudioSettings } from '@/lib/api';
import styles from './admin-operations.module.css';

export function StudioSettingsPanel() {
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<{ settings: StudioSettings }>('/admin/operations/studio');
      setSettings(result.settings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos abrir la configuración.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('settings');
    setError('');
    setNotice('');
    const data = new FormData(event.currentTarget);
    const optional = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value.trim() || undefined : undefined;
    };
    try {
      const result = await apiFetch<{ settings: StudioSettings }>('/admin/operations/studio', {
        method: 'PUT',
        body: JSON.stringify({
          businessName: data.get('businessName'),
          tagline: data.get('tagline'),
          city: data.get('city'),
          state: data.get('state'),
          addressLine: optional('addressLine'),
          publicPhone: optional('publicPhone'),
          whatsapp: optional('whatsapp'),
          instagramUrl: optional('instagramUrl'),
          facebookUrl: optional('facebookUrl'),
          tiktokUrl: optional('tiktokUrl'),
          websiteUrl: optional('websiteUrl'),
          mapUrl: optional('mapUrl'),
        }),
      });
      setSettings(result.settings);
      setNotice('La información pública quedó actualizada.');
      window.dispatchEvent(new Event('dearangel:brand-changed'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar la información.');
    } finally {
      setBusy('');
    }
  }

  async function upload(kind: 'logo' | 'icon', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(kind);
    setError('');
    setNotice('');
    const body = new FormData();
    body.append('image', file);
    try {
      const result = await apiFetch<{ settings: StudioSettings }>(
        `/admin/operations/studio/${kind}`,
        { method: 'POST', body },
      );
      setSettings(result.settings);
      setNotice(
        kind === 'logo' ? 'El logo ya se muestra en la plataforma.' : 'El icono quedó actualizado.',
      );
      window.dispatchEvent(new Event('dearangel:brand-changed'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos subir la imagen.');
    } finally {
      setBusy('');
      event.target.value = '';
    }
  }

  if (!settings)
    return (
      <div className={error ? styles.error : styles.loading}>
        {error || 'Abriendo información del estudio…'}
      </div>
    );
  const version = settings.brandVersion;

  return (
    <div>
      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}
      <div className={styles.settingsGrid}>
        <form className={`${styles.settingsCard} ${styles.settingsForm}`} onSubmit={save}>
          <div>
            <h2>Información pública</h2>
            <p>
              Estos datos aparecen en la portada y ayudan a que la clientela pueda ubicar y
              contactar Dear Angel.
            </p>
          </div>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Nombre del estudio
              <input
                defaultValue={settings.businessName}
                maxLength={120}
                name="businessName"
                required
              />
            </label>
            <label className={styles.field}>
              Ciudad
              <input defaultValue={settings.city} maxLength={80} name="city" required />
            </label>
          </div>
          <label className={styles.field}>
            Frase principal
            <textarea
              defaultValue={settings.tagline}
              maxLength={180}
              name="tagline"
              required
              rows={2}
            />
          </label>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Estado
              <input defaultValue={settings.state} maxLength={80} name="state" required />
            </label>
            <label className={styles.field}>
              Teléfono público
              <input
                defaultValue={settings.publicPhone ?? ''}
                inputMode="tel"
                maxLength={40}
                name="publicPhone"
              />
            </label>
          </div>
          <label className={styles.field}>
            Dirección
            <textarea
              defaultValue={settings.addressLine ?? ''}
              maxLength={240}
              name="addressLine"
              rows={2}
            />
          </label>
          <label className={styles.field}>
            WhatsApp
            <input
              defaultValue={settings.whatsapp ?? ''}
              inputMode="tel"
              maxLength={40}
              name="whatsapp"
              placeholder="Ej. +52 999 000 0000"
            />
          </label>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Instagram
              <input
                defaultValue={settings.instagramUrl ?? ''}
                name="instagramUrl"
                placeholder="https://instagram.com/..."
                type="url"
              />
            </label>
            <label className={styles.field}>
              Facebook
              <input
                defaultValue={settings.facebookUrl ?? ''}
                name="facebookUrl"
                placeholder="https://facebook.com/..."
                type="url"
              />
            </label>
            <label className={styles.field}>
              TikTok
              <input
                defaultValue={settings.tiktokUrl ?? ''}
                name="tiktokUrl"
                placeholder="https://tiktok.com/@..."
                type="url"
              />
            </label>
            <label className={styles.field}>
              Sitio externo
              <input
                defaultValue={settings.websiteUrl ?? ''}
                name="websiteUrl"
                placeholder="https://..."
                type="url"
              />
            </label>
          </div>
          <label className={styles.field}>
            Enlace para llegar en el mapa
            <input
              defaultValue={settings.mapUrl ?? ''}
              name="mapUrl"
              placeholder="https://maps.google.com/..."
              type="url"
            />
          </label>
          <button className={styles.saveButton} disabled={Boolean(busy)} type="submit">
            {busy === 'settings' ? 'Guardando…' : 'Guardar información'}
          </button>
        </form>

        <div className={styles.assetStack}>
          <section className={styles.assetCard}>
            <h2>Logo</h2>
            <p>Se recomienda una imagen horizontal con fondo transparente o crema.</p>
            <div className={styles.assetPreview}>
              {settings.hasLogo ? (
                <img
                  alt="Logo actual"
                  key={`logo-${version}`}
                  src={`/api/backend/studio/logo?v=${version}`}
                />
              ) : (
                <img alt="Logo provisional" src="/brand/logo-placeholder.png" />
              )}
            </div>
            <label className={styles.uploadButton}>
              {busy === 'logo' ? 'Subiendo…' : 'Cambiar logo'}
              <input
                accept="image/png,image/jpeg,image/webp"
                disabled={Boolean(busy)}
                onChange={(event) => void upload('logo', event)}
                type="file"
              />
            </label>
          </section>
          <section className={styles.assetCard}>
            <h2>Icono de la app</h2>
            <p>
              Usa una imagen cuadrada de al menos 512 × 512 px para que se vea bien al instalarla.
            </p>
            <div className={styles.assetPreview}>
              {settings.hasIcon ? (
                <img
                  alt="Icono actual"
                  key={`icon-${version}`}
                  src={`/api/backend/studio/icon?v=${version}`}
                />
              ) : (
                <img alt="Icono provisional" src="/brand/icon-placeholder.png" />
              )}
            </div>
            <label className={styles.uploadButton}>
              {busy === 'icon' ? 'Subiendo…' : 'Cambiar icono'}
              <input
                accept="image/png,image/jpeg,image/webp"
                disabled={Boolean(busy)}
                onChange={(event) => void upload('icon', event)}
                type="file"
              />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}
