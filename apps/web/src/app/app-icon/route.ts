const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? 'http://localhost:3001/api').replace(
  /\/$/,
  '',
);

export async function GET() {
  const response = await fetch(`${API_INTERNAL_URL}/studio/icon`, { cache: 'no-store' }).catch(
    () => null,
  );
  if (!response?.ok || !response.body) {
    return new Response(null, {
      status: 307,
      headers: {
        'Cache-Control': 'public, max-age=3600',
        Location: '/brand/icon-placeholder.png',
      },
    });
  }
  return new Response(response.body, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': response.headers.get('content-type') ?? 'image/png',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const dynamic = 'force-dynamic';
