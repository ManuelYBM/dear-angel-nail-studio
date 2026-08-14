import Link from 'next/link';

import { HomeHeroActions } from '@/components/home-hero-actions';
import { SessionIndicator } from '@/components/session-indicator';
import {
  StudioBrand,
  StudioFooterInfo,
  StudioHeroTitle,
  StudioLogo,
} from '@/components/studio-brand';

const foundations = [
  {
    eyebrow: 'Agenda',
    title: 'Tiempo reservado para ti',
    description:
      'Elige a tu manicurista, consulta horarios reales y reserva sin citas traslapadas.',
  },
  {
    eyebrow: 'Diseños',
    title: 'Inspiración con intención',
    description: 'Explora el catálogo, guarda favoritos o solicita una cotización personalizada.',
  },
  {
    eyebrow: 'Recompensas',
    title: 'Cada visita cuenta',
    description: 'Consulta tus visitas, descuentos desbloqueados y beneficios disponibles.',
  },
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="cloud cloud--one" aria-hidden="true" />
        <div className="cloud cloud--two" aria-hidden="true" />

        <nav className="nav shell" aria-label="Navegación principal">
          <StudioBrand />
          <div className="nav__actions">
            <a href="#experiencia">Experiencia</a>
            <Link href="/catalogo">Diseños</Link>
            <Link href="/reservar">Reservar</Link>
            <SessionIndicator />
          </div>
        </nav>

        <nav className="home-mobile-navigation" aria-label="Accesos rápidos">
          <span className="home-mobile-links">
            <Link href="/catalogo">Diseños</Link>
            <Link href="/reservar">Reservar</Link>
          </span>
          <SessionIndicator compact mobileOnlyWhenAnonymous />
        </nav>

        <div className="hero__content shell">
          <div className="hero__copy">
            <StudioHeroTitle />
            <p>
              Reserva tu cita, descubre diseños y lleva contigo el avance de cada visita a Dear
              Angel.
            </p>
            <HomeHeroActions />
          </div>

          <div className="hero__art" aria-label="Identidad de Dear Angel">
            <div className="gold-orbit" aria-hidden="true" />
            <div className="logo-card">
              <span className="logo-card__note">Dear Angel Nail Studio</span>
              <StudioLogo />
              <p>Querida, tú eres tu mejor carta de amor.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="experience shell" id="experiencia">
        <div className="section-heading">
          <span>Todo Dear Angel en un mismo lugar</span>
          <h2>Tu cita empieza desde aquí.</h2>
          <p>
            Encuentra inspiración, elige el horario que mejor te queda y consulta los beneficios de
            cada visita desde tu cuenta.
          </p>
        </div>

        <div className="foundation-grid">
          {foundations.map((foundation, index) => (
            <article className="foundation-card" key={foundation.title}>
              <span className="foundation-card__number">0{index + 1}</span>
              <span className="foundation-card__eyebrow">{foundation.eyebrow}</span>
              <h3>{foundation.title}</h3>
              <p>{foundation.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="footer shell">
        <StudioFooterInfo />
        <Link href="/politicas">Políticas de reservación</Link>
      </footer>
    </main>
  );
}
