'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { CurrentUser, LoyaltyProfile } from '@/lib/api';
import { LoyaltyJourney } from './loyalty-journey';
import portal from './portal.module.css';

export function MyLoyaltyPanel() {
  const router = useRouter();
  const [profile, setProfile] = useState<LoyaltyProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ user: CurrentUser }>('/auth/me'),
      apiFetch<LoyaltyProfile>('/loyalty/me'),
    ])
      .then(([session, result]) => {
        if (session.user.role !== 'CLIENT') throw new Error('Esta vista pertenece a clientas.');
        setProfile(result);
      })
      .catch((reason) => {
        if (reason instanceof Error && reason.message.includes('clientas'))
          setError(reason.message);
        else router.replace('/acceso');
      });
  }, [router]);

  if (error) return <div className={portal.error}>{error}</div>;
  if (!profile) return <div className={portal.loading}>Preparando tus recompensas…</div>;
  return <LoyaltyJourney profile={profile} />;
}
