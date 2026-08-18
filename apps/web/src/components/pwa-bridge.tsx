'use client';

import { useEffect, useState } from 'react';

import styles from './pwa-bridge.module.css';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaBridge() {
  const [online, setOnline] = useState(true);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setStandalone(window.matchMedia('(display-mode: standalone)').matches);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const installed = () => {
      setStandalone(true);
      setPrompt(null);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installed);
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => undefined);
    }
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  async function install() {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setStandalone(true);
      setPrompt(null);
      return;
    }
    if (isIOS) setShowIOSHint(true);
  }

  const canInstall = !standalone && (Boolean(prompt) || isIOS);

  return (
    <>
      {!online ? (
        <div className={styles.offline} role="status">
          Sin conexión · vuelve a intentar las acciones pendientes cuando regrese internet
        </div>
      ) : null}
      {canInstall ? (
        <div className={styles.installWrap}>
          {showIOSHint ? (
            <div className={styles.iosHint}>
              <button
                aria-label="Cerrar indicación"
                onClick={() => setShowIOSHint(false)}
                type="button"
              >
                ×
              </button>
              <strong>Instalar en iPhone</strong>
              <br />
              Abre el botón Compartir de Safari y elige “Agregar a pantalla de inicio”.
            </div>
          ) : null}
          <button className={styles.installButton} onClick={() => void install()} type="button">
            <span aria-hidden="true">↓</span> Instalar Dear Angel
          </button>
        </div>
      ) : null}
    </>
  );
}
