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
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [search, setSearch] = useState('');
  const [technique, setTechnique] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      apiFetch<{ items: CatalogDesign[] }>('/catalog/designs/personalized').catch(() =>
        apiFetch<{ items: CatalogDesign[] }>('/catalog/designs'),
      ),
      apiFetch<{ user: CurrentUser }>('/auth/me').catch(() => null),
    ])
      .then(([result, session]) => {
        setDesigns(result.items);
        setUser(session?.user ?? null);
      })
      .catch(() => setError('No pudimos abrir el catálogo.'))
      .finally(() => setLoading(false));
  }, []);

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
      (!favorites || design.favorite)
    );
  });

  async function toggleFavorite(design: CatalogDesign) {
    if (!user) {
      window.location.href = '/acceso';
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
        <button
          aria-pressed={favorites}
          className={favorites ? styles.filterActive : ''}
          onClick={() => setFavorites((value) => !value)}
          type="button"
        >
          ♡ Mis favoritos
        </button>
      </div>
      {loading ? <div className={portal.loading}>Preparando inspiración para ti…</div> : null}
      {error ? <div className={portal.error}>{error}</div> : null}
      {!loading && filtered.length === 0 ? (
        <div className={styles.empty}>
          <span>✦</span>
          <strong>Aún no hay diseños con esos filtros.</strong>
          <p>Prueba otra búsqueda o crea una cotización personalizada.</p>
          <Link href="/cotizar">Cotizar mi idea</Link>
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
                <small>Imagen de demostración</small>
              ) : design.featured ? (
                <small>Favorito del estudio</small>
              ) : null}
              <button
                aria-label={design.favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                onClick={() => toggleFavorite(design)}
                type="button"
              >
                {design.favorite ? '♥' : '♡'}
              </button>
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
                <Link href={`/reservar?designId=${design.id}`}>Elegir diseño</Link>
              </footer>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
