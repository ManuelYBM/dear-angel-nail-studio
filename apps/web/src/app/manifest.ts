import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dear Angel Nail Studio',
    short_name: 'Dear Angel',
    description: 'Agenda y experiencia de Dear Angel Nail Studio.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    scope: '/',
    background_color: '#fffaf2',
    theme_color: '#f5d6dc',
    lang: 'es-MX',
    icons: [
      {
        src: '/app-icon',
        sizes: '512x512',
        purpose: 'maskable',
      },
      {
        src: '/brand/icon-placeholder.png',
        sizes: '640x640',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      { name: 'Reservar cita', short_name: 'Reservar', url: '/reservar' },
      { name: 'Mi agenda', short_name: 'Agenda', url: '/agenda' },
      { name: 'Diseños', short_name: 'Diseños', url: '/catalogo' },
    ],
  };
}
