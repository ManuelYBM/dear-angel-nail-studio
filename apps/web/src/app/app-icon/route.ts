import { NextResponse } from 'next/server';

const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? 'http://localhost:3001/api').replace(
  /\/$/,
  '',
);

export async function GET(request: Request) {
  const response = await fetch(`${API_INTERNAL_URL}/studio/icon`, { cache: 'no-store' }).catch(
    () => null,
  );
  if (!response?.ok || !response.body) {
    return NextResponse.redirect(new URL('/brand/icon-placeholder.png', request.url), 307);
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
