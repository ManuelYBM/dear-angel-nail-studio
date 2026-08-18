'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { CatalogDesign } from '@/lib/api';
import styles from './home-design-preview.module.css';

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export function HomeDesignPreview() {
  const [designs, setDesigns] = useState<CatalogDesign[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void apiFetch<{ items: CatalogDesign[] }>('/catalog/designs?limit=3')
      .then(({ items }) => {
        if (active) setDesigns(items.slice(0, 3));
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section aria-labelledby="home-designs-title" className={styles.section}>
      <div className={styles.inner}>
        <header className={styles.heading}>
          <div>
            <span>Inspiración Dear Angel</span>
            <h2 id="home-designs-title">Diseños para tu próxima cita.</h2>
            <p>Una pequeña selección del estudio; el catálogo completo te espera aparte.</p>
          </div>
          <Link className={styles.catalogLink} href="/catalogo">
            Ver todos los diseños
          </Link>
        </header>

        {failed ? (
          <div className={styles.fallback}>
            <span>La galería está tomando un respiro.</span>
            <Link href="/catalogo">Abrir el catálogo</Link>
          </div>
        ) : null}

        {!failed ? (
          <div aria-busy={designs === null} className={styles.cards}>
            {designs === null
              ? [0, 1, 2].map((item) => <div className={styles.skeleton} key={item} />)
              : designs.map((design) => {
                  const image = design.images[0];
                  const demo = design.images.some((item) => item.filename.endsWith('-demo.png'));
                  return (
                    <article className={styles.card} key={design.id}>
                      <div className={styles.image}>
                        {image ? (
                          <Image
                            alt={design.title}
                            fill
                            sizes="(max-width: 700px) 82vw, (max-width: 1000px) 45vw, 360px"
                            src={`/api/backend/catalog/images/${image.id}`}
                          />
                        ) : (
                          <span aria-hidden="true" className={styles.placeholder}>
                            DA
                          </span>
                        )}
                        {demo ? (
                          <small>Imagen de muestra</small>
                        ) : design.featured ? (
                          <small>Selección del estudio</small>
                        ) : null}
                      </div>
                      <div className={styles.body}>
                        <div className={styles.meta}>
                          <span>
                            {design.technique}
                            {design.nailLength ? ` · ${design.nailLength}` : ''}
                          </span>
                          <span>{design.durationMinutes} min</span>
                        </div>
                        <h3>{design.title}</h3>
                        <footer>
                          <strong>{money.format(design.priceCents / 100)}</strong>
                          <Link href={`/reservar?designId=${design.id}`}>Reservar este diseño</Link>
                        </footer>
                      </div>
                    </article>
                  );
                })}
          </div>
        ) : null}

        {designs?.length === 0 ? (
          <div className={styles.fallback}>
            <span>Pronto aparecerá aquí una selección del estudio.</span>
            <Link href="/cotizar">Cotizar una idea</Link>
          </div>
        ) : null}

        <Link className={styles.mobileCatalogLink} href="/catalogo">
          Ver todos los diseños
        </Link>
      </div>
    </section>
  );
}
