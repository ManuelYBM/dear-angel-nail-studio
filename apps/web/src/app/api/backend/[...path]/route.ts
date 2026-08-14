import type { NextRequest } from 'next/server';

const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? 'http://localhost:3001/api').replace(
  /\/$/,
  '',
);

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const incomingUrl = new URL(request.url);
  const targetUrl = `${API_INTERNAL_URL}/${path.map(encodeURIComponent).join('/')}${incomingUrl.search}`;
  const headers = new Headers(request.headers);

  for (const header of [
    'connection',
    'content-length',
    'expect',
    'host',
    'origin',
    'referer',
    'transfer-encoding',
  ]) {
    headers.delete(header);
  }
  // Evita que respuestas comprimidas por la API conserven una codificación
  // que fetch ya descomprimió al reenviarlas al navegador.
  headers.delete('accept-encoding');
  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('content-length');
  responseHeaders.delete('content-encoding');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const dynamic = 'force-dynamic';
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
