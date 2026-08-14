import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

const webBase = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
const apiBase = `${webBase}/api/backend`;
const directApi = process.env.E2E_API_URL ?? 'http://127.0.0.1:3001/api';
const demoPassword = process.env.DEMO_INITIAL_PASSWORD ?? 'DearAngelDemo2026';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://dear_angel:dear_angel_local_password@127.0.0.1:5432/dear_angel?schema=public',
    },
  },
});

const results = [];
const sessionHashes = [];
const marker = `[E2E:${Date.now()}]`;
let failed = false;

function record(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) failed = true;
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('base64url');
}

function cookieFrom(response) {
  const raw =
    response.headers.getSetCookie?.().join('; ') ?? response.headers.get('set-cookie') ?? '';
  const match = raw.match(/(?:^|[,;]\s*)da_session=([^;,\s]+)/);
  if (!match?.[1]) throw new Error('La respuesta no incluyó la cookie de sesión.');
  const token = match[1];
  sessionHashes.push(tokenHash(token));
  return `da_session=${token}`;
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set('Cookie', options.cookie);
  if (options.json !== undefined) headers.set('Content-Type', 'application/json');
  return fetch(`${apiBase}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    redirect: 'manual',
  });
}

async function login(identifier) {
  const response = await request('/auth/login', {
    method: 'POST',
    json: { identifier, password: demoPassword },
  });
  record(`Inicio de sesión ${identifier}`, response.status === 201, `HTTP ${response.status}`);
  if (!response.ok) throw new Error(`No se pudo iniciar sesión con ${identifier}.`);
  const cookie = cookieFrom(response);
  const setCookie = response.headers.get('set-cookie') ?? '';
  record(
    'Cookie HttpOnly y SameSite',
    /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie),
    'Atributos presentes',
  );
  return cookie;
}

async function adminCookie() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  if (!admin) throw new Error('No existe una administradora activa.');
  const token = randomBytes(32).toString('base64url');
  const hash = tokenHash(token);
  sessionHashes.push(hash);
  await prisma.session.create({
    data: {
      userId: admin.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ipAddress: '127.0.0.1',
      userAgent: 'Dear Angel E2E',
    },
  });
  return `da_session=${token}`;
}

try {
  let response = await fetch(`${webBase}/`);
  const html = await response.text();
  record(
    'Portada web',
    response.status === 200 && html.includes('Dear Angel'),
    `HTTP ${response.status}`,
  );
  record(
    'Cabeceras web de seguridad',
    response.headers.get('x-frame-options') === 'DENY' &&
      response.headers.get('x-content-type-options') === 'nosniff' &&
      response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"),
    'CSP, DENY y nosniff',
  );

  response = await fetch(`${webBase}/manifest.webmanifest`);
  const manifest = await response.json();
  record(
    'Manifest PWA',
    response.status === 200 && manifest.name === 'Dear Angel Nail Studio',
    `HTTP ${response.status}`,
  );
  response = await fetch(`${webBase}/sw.js`);
  const serviceWorker = await response.text();
  record(
    'Service worker seguro',
    response.status === 200 && serviceWorker.includes("url.pathname.startsWith('/api/')"),
    `HTTP ${response.status}`,
  );

  response = await fetch(`${directApi}/health/ready`);
  const health = await response.json();
  record(
    'Salud integral API',
    response.status === 200 && health.dependencies?.storage === 'ok',
    `HTTP ${response.status}`,
  );
  record(
    'Cabeceras API de seguridad',
    response.headers.get('x-frame-options') === 'DENY' &&
      response.headers.get('x-content-type-options') === 'nosniff',
    'DENY y nosniff',
  );

  response = await request('/admin/operations/dashboard');
  record('Administración sin sesión', response.status === 401, `HTTP ${response.status}`);
  response = await request('/payments/00000000-0000-0000-0000-000000000000/receipt');
  record('Comprobante privado sin sesión', response.status === 401, `HTTP ${response.status}`);

  const clientCookie = await login('+529990000101');
  response = await request('/auth/me', { cookie: clientCookie });
  const clientMe = await response.json();
  record(
    'Sesión de cliente',
    response.status === 200 && clientMe.user?.role === 'CLIENT',
    `HTTP ${response.status}`,
  );
  response = await request('/admin/operations/dashboard', { cookie: clientCookie });
  record('Cliente bloqueado en administración', response.status === 403, `HTTP ${response.status}`);

  const technicianCookie = await login('demo.manicurista1@dearangel.local');
  response = await request('/auth/me', { cookie: technicianCookie });
  const technicianMe = await response.json();
  record(
    'Sesión de manicurista',
    response.status === 200 && technicianMe.user?.role === 'NAIL_TECHNICIAN',
    `HTTP ${response.status}`,
  );
  const deposit = await prisma.depositPayment.findFirst({
    where: { reference: { startsWith: 'DA-DEMO-' } },
  });
  if (!deposit) throw new Error('Faltan anticipos demostrativos.');
  response = await request(`/payments/${deposit.id}/receipt`, { cookie: technicianCookie });
  record('Comprobante bloqueado a manicurista', response.status === 403, `HTTP ${response.status}`);

  const startAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
  startAt.setUTCHours(19, 43, 0, 0);
  const manualBody = {
    technicianId: technicianMe.user.id,
    guestName: 'Prueba automática',
    guestPhone: '+529990009999',
    startAt: startAt.toISOString(),
    durationMinutes: 60,
    notes: marker,
  };
  response = await request('/appointments/manual', {
    method: 'POST',
    cookie: technicianCookie,
    json: manualBody,
  });
  record('Cita manual a minuto libre', response.status === 201, `HTTP ${response.status}`);
  response = await request('/appointments/manual', {
    method: 'POST',
    cookie: technicianCookie,
    json: { ...manualBody, notes: `${marker}:OVERLAP` },
  });
  record('Traslape rechazado', response.status === 409, `HTTP ${response.status}`);
  response = await request('/appointments/manual', {
    method: 'POST',
    cookie: clientCookie,
    json: manualBody,
  });
  record('Cliente no crea citas manuales', response.status === 403, `HTTP ${response.status}`);

  const admin = await adminCookie();
  const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  response = await request(`/admin/operations/dashboard?from=${from}&to=${to}`, { cookie: admin });
  const dashboard = await response.json();
  record(
    'Dashboard con datos',
    response.status === 200 && dashboard.appointments?.total >= 15,
    `HTTP ${response.status}`,
  );
  for (const report of ['appointments', 'deposits', 'clients', 'designs']) {
    response = await request(`/admin/operations/reports/${report}?from=${from}&to=${to}`, {
      cookie: admin,
    });
    const body = await response.json();
    record(
      `Reporte ${report}`,
      response.status === 200 && Array.isArray(body.items),
      `HTTP ${response.status}`,
    );
  }
  response = await request(
    `/admin/operations/reports/export/appointments/csv?from=${from}&to=${to}`,
    { cookie: admin },
  );
  record(
    'CSV integrado',
    response.status === 200 && (await response.arrayBuffer()).byteLength > 100,
    `HTTP ${response.status}`,
  );
  response = await request(
    `/admin/operations/reports/export/appointments/xlsx?from=${from}&to=${to}`,
    { cookie: admin },
  );
  const xlsx = new Uint8Array(await response.arrayBuffer());
  record(
    'XLSX integrado',
    response.status === 200 && xlsx[0] === 0x50 && xlsx[1] === 0x4b,
    `HTTP ${response.status}`,
  );
  response = await request('/admin/operations/audit?page=1&pageSize=10', { cookie: admin });
  const audit = await response.json();
  record(
    'Auditoría paginada',
    response.status === 200 && Array.isArray(audit.items),
    `HTTP ${response.status}`,
  );
} finally {
  await prisma.appointment
    .deleteMany({ where: { notes: { startsWith: marker } } })
    .catch(() => undefined);
  if (sessionHashes.length) {
    await prisma.session
      .deleteMany({ where: { tokenHash: { in: sessionHashes } } })
      .catch(() => undefined);
  }
  await prisma.$disconnect();
}

for (const result of results) {
  console.log(`${result.ok ? 'OK' : 'FAIL'} | ${result.name} | ${result.detail}`);
}
if (failed) process.exitCode = 1;
