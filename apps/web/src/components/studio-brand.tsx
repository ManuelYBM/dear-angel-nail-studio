'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { apiFetch } from '@/lib/api';
import type { StudioSettings } from '@/lib/api';
import styles from './studio-brand.module.css';

const fallback: StudioSettings = {
  id: 'default',
  businessName: 'Dear Angel Nail Studio',
  tagline: 'Una carta al autocuidado y la belleza.',
  city: 'Mérida',
  state: 'Yucatán',
  addressLine: null,
  publicPhone: null,
  whatsapp: null,
  instagramUrl: null,
  facebookUrl: null,
  tiktokUrl: null,
  websiteUrl: null,
  mapUrl: null,
  brandVersion: 1,
  hasLogo: false,
  hasIcon: false,
  updatedAt: '',
};
const StudioContext = createContext(fallback);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(fallback);
  useEffect(() => {
    let active = true;
    const load = () =>
      void apiFetch<{ settings: StudioSettings }>('/studio/settings')
        .then((result) => active && setSettings(result.settings))
        .catch(() => undefined);
    load();
    window.addEventListener('dearangel:brand-changed', load);
    return () => {
      active = false;
      window.removeEventListener('dearangel:brand-changed', load);
    };
  }, []);
  return <StudioContext.Provider value={settings}>{children}</StudioContext.Provider>;
}

export function StudioBrand({ portal = false }: { portal?: boolean }) {
  const studio = useContext(StudioContext);
  return (
    <Link className={`${styles.brand} ${portal ? styles.portal : ''}`} href="/">
      <span className={styles.mark}>
        {studio.hasIcon ? (
          <img alt="" src={`/api/backend/studio/icon?v=${studio.brandVersion}`} />
        ) : (
          'DA'
        )}
      </span>
      <span className={styles.name}>{studio.businessName.replace(/ Nail Studio$/i, '')}</span>
    </Link>
  );
}

export function StudioHeroTitle() {
  const studio = useContext(StudioContext);
  return (
    <>
      <span className={styles.location}>
        Nail Studio · {studio.city}, {studio.state}
      </span>
      <h1 className={styles.heroTitle}>{studio.tagline}</h1>
    </>
  );
}

export function StudioLogo() {
  const studio = useContext(StudioContext);
  return (
    <img
      className={styles.logoImage}
      alt={studio.businessName}
      src={
        studio.hasLogo
          ? `/api/backend/studio/logo?v=${studio.brandVersion}`
          : '/brand/logo-placeholder.png'
      }
    />
  );
}

export function StudioFooterInfo() {
  const studio = useContext(StudioContext);
  const whatsapp = studio.whatsapp?.replace(/\D/g, '');
  return (
    <div className={styles.footerInfo}>
      <span>{studio.businessName}</span>
      <div className={styles.footerLinks}>
        {whatsapp ? (
          <a href={`https://wa.me/${whatsapp}`} rel="noreferrer" target="_blank">
            WhatsApp
          </a>
        ) : null}
        {studio.instagramUrl ? (
          <a href={studio.instagramUrl} rel="noreferrer" target="_blank">
            Instagram
          </a>
        ) : null}
        {studio.facebookUrl ? (
          <a href={studio.facebookUrl} rel="noreferrer" target="_blank">
            Facebook
          </a>
        ) : null}
        {studio.tiktokUrl ? (
          <a href={studio.tiktokUrl} rel="noreferrer" target="_blank">
            TikTok
          </a>
        ) : null}
        {studio.mapUrl ? (
          <a href={studio.mapUrl} rel="noreferrer" target="_blank">
            Cómo llegar
          </a>
        ) : null}
      </div>
      <span>{studio.addressLine ?? `${studio.city}, ${studio.state}`}</span>
    </div>
  );
}
