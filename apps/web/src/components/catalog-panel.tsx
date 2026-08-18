'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { CatalogDesign, CurrentUser } from '@/lib/api';
import styles from './catalog.module.css';
import portal from './portal.module.css';

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export function CatalogPanel() {
  const [designs, setDesigns] = useState<CatalogDesign[]>([]);
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [technique, setTechnique] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let requestId = 0;

    const loadCatalog = async () => {
      const currentRequest = ++requestId;
      setLoading(true);
      setError('');
      const session = await apiFetch<{ user: CurrentUser }>('/auth/me').catch(() => null);
      if (!active || currentRequest !== requestId) return;
      setUser(session?.user ?? null);
      setFavorites(false);
      try {
        const result = await apiFetch<{ items: CatalogDesign[] }>(
          session?.user.role === 'CLIENT' ? '/catalog/designs/personalized' : '/catalog/designs',
        ).catch(() => apiFetch<{ items: CatalogDesign[] }>('/catalog/designs'));
        if (active && currentRequest === requestId) setDesigns(result.items);
      } catch {
        if (active && currentRequest === requestId) setError('No pudimos abrir el catálogo.');
      } finally {
        if (active && currentRequest === requestId) setLoading(false);
      }
    };

    void loadCatalog();
    window.addEventListener('dearangel:session-changed', loadCatalog);
    return () => {
      active = false;
      window.removeEventListener('dearangel:session-changed', loadCatalog);
    };
  }, []);

  const isStaff = user?.role === 'ADMIN' || user?.role === 'NAIL_TECHNICIAN';
  const canUseClientActions = user === null || user?.role === 'CLIENT';

  const techniques = useMemo(
    () => [...new Set(designs.map((design) => design.technique))].sort(),
    [designs],
  );
  const filtered = designs.filter((design) => {
    const term = search.trim().toLocaleLowerCase('es-MX');
    return (
      (!term ||
        `${design.title} ${design.description} ${design.categories.join(' ')}`
          .toLocaleLowerCase('es-MX')
          .includes(term)) &&
      (!technique || design.technique === technique) &&
      (!canUseClientActions || !favorites || design.favorite)
    );
  });

  async function toggleFavorite(design: CatalogDesign) {
    if (!user) {
      window.location.href = '/acceso';
      return;
    }
    if (user.mustChangePassword) {
      window.location.href = '/mi-cuenta';
      return;
    }
    if (user.role !== 'CLIENT') return;
    try {
      const result = await apiFetch<{ favorite: boolean }>(
        `/catalog/designs/${design.id}/favorite`,
        { method: 'POST' },
      );
      setDesigns((current) =>
        current.map((item) =>
          item.id === design.id ? { ...item, favorite: result.favorite } : item,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar tu favorito.');
    }
  }

  return (
    <div>
      <div className={styles.filters}>
        <input
          aria-label="Buscar diseños"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar estilo, color o detalle…"
          value={search}
        />
        <select
          aria-label="Filtrar por técnica"
          onChange={(event) => setTechnique(event.target.value)}
          value={technique}
        >
          <option value="">Todas las técnicas</option>
          {techniques.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        {canUseClientActions ? (
          <button
            aria-pressed={favorites}
            className={favorites ? styles.filterActive : ''}
            onClick={() => setFavorites((value) => !value)}
            type="button"
          >
            ♡ Mis favoritos
          </button>
        ) : user?.role === 'ADMIN' ? (
          <Link className={styles.filterLink} href="/administracion/catalogo">
            Administrar catálogo
          </Link>
        ) : null}
      </div>
      {loading ? <div className={portal.loading}>Preparando inspiración para ti…</div> : null}
      {error ? <div className={portal.error}>{error}</div> : null}
      {!loading && filtered.length === 0 ? (
        <div className={styles.empty}>
          <span>✦</span>
          <strong>Aún no hay diseños con esos filtros.</strong>
          <p>
            {isStaff
              ? 'Prueba otra búsqueda o revisa nuevamente más tarde.'
              : 'Prueba otra búsqueda o crea una cotización personalizada.'}
          </p>
          {canUseClientActions ? <Link href="/cotizar">Cotizar mi idea</Link> : null}
        </div>
      ) : null}
      <div className={styles.designGrid}>
        {filtered.map((design) => (
          <article className={styles.designCard} key={design.id}>
            <div className={styles.designImage}>
              {design.images[0] ? (
                <img
                  alt={design.title}
                  src={`/api/backend/catalog/images/${design.images[0].id}`}
                />
              ) : (
                <span aria-hidden="true">DA</span>
              )}
              {design.images.some((image) => image.filename.endsWith('-demo.png')) ? (
                <small>Imagen de muestra</small>
              ) : design.featured ? (
                <small>Favorito del estudio</small>
              ) : null}
              {canUseClientActions ? (
                <button
                  aria-label={design.favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                  onClick={() => toggleFavorite(design)}
                  type="button"
                >
                  {design.favorite ? '♥' : '♡'}
                </button>
              ) : null}
            </div>
            <div className={styles.designBody}>
              <div>
                <span>
                  {design.technique}
                  {design.nailLength ? ` · ${design.nailLength}` : ''}
                </span>
                <span>{design.durationMinutes} min</span>
              </div>
              <h2>{design.title}</h2>
              <p>{design.description}</p>
              <div className={styles.tags}>
                {design.categories.map((category) => (
                  <span key={category}>{category}</span>
                ))}
              </div>
              <footer>
                <strong>{money.format(design.priceCents / 100)}</strong>
                {canUseClientActions ? (
                  <Link href={`/reservar?designId=${design.id}`}>Elegir diseño</Link>
                ) : null}
              </footer>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
