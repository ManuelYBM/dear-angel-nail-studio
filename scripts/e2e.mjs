import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createHash, createHmac, randomBytes } from 'node:crypto';

const webBase = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
const apiBase = `${webBase}/api/backend`;
const directApi = process.env.E2E_API_URL ?? 'http://127.0.0.1:3001/api';
const demoPassword = process.env.DEMO_INITIAL_PASSWORD ?? 'DearAngelDemo2026';
const otpPepper = process.env.OTP_PEPPER ?? 'dear_angel_local_otp_pepper';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://dear_angel:dear_angel_local_password@127.0.0.1:5432/dear_angel?schema=public',
    },
  },
});
const redis = new Redis(process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

const results = [];
const sessionHashes = [];
const quoteIds = [];
const marker = `[E2E:${Date.now()}]`;
let failed = false;
let forcedPasswordChangeUserId;
let adminPasswordState;
let pendingRegistrationUserId;
let pendingRegistrationCooldownKey;
let redisConnected = false;

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
  adminPasswordState = { id: admin.id, mustChangePassword: admin.mustChangePassword };
  if (admin.mustChangePassword) {
    // El guard ya se prueba de forma explícita con la sesión de manicurista. Para recorrer los
    // reportes sin depender de la contraseña local de una instalación existente, habilitamos esta
    // sesión de prueba y restauramos el indicador original en el bloque finally.
    await prisma.user.update({
      where: { id: admin.id },
      data: { mustChangePassword: false },
    });
  }
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
    'Navegación global con Inicio',
    html.includes('Navegación principal') && html.includes('>Inicio</a>'),
    'Barra compartida presente',
  );
  record(
    'Portada muestra selección de diseños',
    html.includes('id="home-designs-title"') && html.includes('Ver todos los diseños'),
    'Preview y acceso al catálogo presentes',
  );
  record(
    'Cabeceras web de seguridad',
    response.headers.get('x-frame-options') === 'DENY' &&
      response.headers.get('x-content-type-options') === 'nosniff' &&
      response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"),
    'CSP, DENY y nosniff',
  );

  response = await fetch(`${webBase}/registro`);
  const registrationHtml = await response.text();
  record(
    'Registro muestra país y lada',
    response.status === 200 &&
      registrationHtml.includes('id="phone-country"') &&
      registrationHtml.includes('>+52</span>'),
    `HTTP ${response.status}`,
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

  response = await request('/catalog/designs?limit=3');
  const homeDesigns = await response.json();
  record(
    'Preview pública limita diseños',
    response.status === 200 && Array.isArray(homeDesigns.items) && homeDesigns.items.length <= 3,
    `HTTP ${response.status}`,
  );

  response = await request('/admin/operations/dashboard');
  record('Administración sin sesión', response.status === 401, `HTTP ${response.status}`);
  response = await request('/payments/00000000-0000-0000-0000-000000000000/receipt');
  record('Comprobante privado sin sesión', response.status === 401, `HTTP ${response.status}`);
  response = await request('/internal/jobs/notification-deliveries', { method: 'POST' });
  record('Worker interno exige token', response.status === 401, `HTTP ${response.status}`);
  response = await request('/auth/register/client', {
    method: 'POST',
    json: {
      fullName: 'Prueba de lada',
      sex: 'PREFER_NOT_TO_SAY',
      phone: '9991234567',
      password: 'Prueba2026',
      passwordConfirmation: 'Prueba2026',
      acceptedMinorNotice: true,
    },
  });
  const missingCountryCode = await response.json();
  record(
    'API exige lada internacional',
    response.status === 400 && missingCountryCode.code === 'PHONE_COUNTRY_CODE_REQUIRED',
    `HTTP ${response.status}`,
  );

  const demoClient = await prisma.user.findUnique({
    where: { phone: '+529990000101' },
    select: { passwordHash: true },
  });
  if (!demoClient?.passwordHash) throw new Error('Falta la clienta demo con contraseña.');

  const pendingPhone = `+52999${String(Date.now()).slice(-7)}`;
  const pendingCode = '654321';
  const pendingRegistration = await prisma.user.create({
    data: {
      role: 'CLIENT',
      status: 'PENDING_VERIFICATION',
      fullName: `${marker}:REGISTRO_PENDIENTE`,
      sex: 'PREFER_NOT_TO_SAY',
      phone: pendingPhone,
      passwordHash: demoClient.passwordHash,
      registrationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  pendingRegistrationUserId = pendingRegistration.id;
  const pendingChallenge = await prisma.verificationChallenge.create({
    data: {
      userId: pendingRegistration.id,
      purpose: 'VERIFY_PHONE',
      channel: 'WHATSAPP',
      destination: pendingPhone,
      codeHash: createHmac('sha256', otpPepper).update(pendingCode).digest('base64url'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  await redis.connect();
  redisConnected = true;
  pendingRegistrationCooldownKey = `identity:challenge:${pendingRegistration.id}:VERIFY_PHONE`;
  await redis.set(pendingRegistrationCooldownKey, '1', 'EX', 120);

  response = await request('/auth/login', {
    method: 'POST',
    json: { identifier: pendingPhone, password: demoPassword },
  });
  const pendingLogin = await response.json();
  const pendingLoginCookies =
    response.headers.getSetCookie?.().join('; ') ?? response.headers.get('set-cookie') ?? '';
  const pendingLoginSessions = await prisma.session.count({
    where: { userId: pendingRegistration.id },
  });
  record(
    'Registro pendiente reanuda verificación',
    response.status === 201 &&
      pendingLogin.verificationRequired === true &&
      pendingLogin.verification?.challengeId === pendingChallenge.id,
    `HTTP ${response.status}`,
  );
  record(
    'Registro pendiente no abre sesión',
    !/(?:^|[,;]\s*)da_session=/.test(pendingLoginCookies) && pendingLoginSessions === 0,
    'Sin cookie ni sesión persistida',
  );

  response = await request('/auth/verify-phone', {
    method: 'POST',
    json: { challengeId: pendingChallenge.id, code: pendingCode },
  });
  const verifiedPending = await response.json();
  const verificationCookies =
    response.headers.getSetCookie?.().join('; ') ?? response.headers.get('set-cookie') ?? '';
  const activatedPending = await prisma.user.findUnique({
    where: { id: pendingRegistration.id },
    select: { status: true, phoneVerifiedAt: true, registrationExpiresAt: true },
  });
  record(
    'OTP activa el registro pendiente',
    response.status === 201 &&
      verifiedPending.user?.status === 'ACTIVE' &&
      /(?:^|[,;]\s*)da_session=/.test(verificationCookies),
    `HTTP ${response.status}`,
  );
  record(
    'Verificación limpia la caducidad temporal',
    activatedPending?.status === 'ACTIVE' &&
      activatedPending.phoneVerifiedAt instanceof Date &&
      activatedPending.registrationExpiresAt === null,
    'Cuenta activa, teléfono verificado y TTL eliminado',
  );

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
  response = await request('/appointments?limit=2', { cookie: clientCookie });
  const appointmentPage = await response.json();
  record(
    'Agenda paginada con política dinámica',
    response.status === 200 &&
      Array.isArray(appointmentPage.items) &&
      appointmentPage.items.length <= 2 &&
      typeof appointmentPage.policy?.clientRescheduleLimit === 'number' &&
      Object.hasOwn(appointmentPage, 'nextCursor'),
    `HTTP ${response.status}`,
  );

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
  const manualAppointment = response.ok ? (await response.json()).appointment : null;
  if (manualAppointment?.id) {
    response = await request(`/appointments/${manualAppointment.id}/status`, {
      method: 'PATCH',
      cookie: technicianCookie,
      json: { status: 'COMPLETED' },
    });
    record('Cita futura no puede completarse', response.status === 409, `HTTP ${response.status}`);
  }
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

  response = await request('/catalog/quotes', {
    method: 'POST',
    cookie: clientCookie,
    json: { noDesign: true, clientNotes: marker, selections: [] },
  });
  const createdQuote = response.ok ? (await response.json()).quote : null;
  record('Clienta crea cotización cancelable', response.status === 201, `HTTP ${response.status}`);
  if (createdQuote?.id) {
    quoteIds.push(createdQuote.id);
    response = await request(`/catalog/quotes/${createdQuote.id}/claim`, {
      method: 'POST',
      cookie: technicianCookie,
    });
    record(
      'Manicurista reclama cotización abierta',
      response.status === 201,
      `HTTP ${response.status}`,
    );

    const secondTechnicianCookie = await login('demo.manicurista2@dearangel.local');
    response = await request(`/catalog/quotes/${createdQuote.id}`, {
      cookie: secondTechnicianCookie,
    });
    record(
      'Cotización reclamada queda privada',
      response.status === 403,
      `HTTP ${response.status}`,
    );

    response = await request(`/catalog/quotes/${createdQuote.id}/cancel`, {
      method: 'PATCH',
      cookie: clientCookie,
    });
    const cancelledQuote = response.ok ? (await response.json()).quote : null;
    record(
      'Clienta cancela cotización pendiente',
      response.status === 200 && cancelledQuote?.status === 'CANCELLED',
      `HTTP ${response.status}`,
    );
  }

  forcedPasswordChangeUserId = technicianMe.user.id;
  await prisma.user.update({
    where: { id: forcedPasswordChangeUserId },
    data: { mustChangePassword: true },
  });
  response = await request('/appointments', { cookie: technicianCookie });
  const blockedByTemporaryPassword = await response.json();
  record(
    'Clave temporal bloquea la API protegida',
    response.status === 403 && blockedByTemporaryPassword.code === 'PASSWORD_CHANGE_REQUIRED',
    `HTTP ${response.status}`,
  );
  response = await request('/auth/me', { cookie: technicianCookie });
  record(
    'Clave temporal conserva acceso a perfil',
    response.status === 200,
    `HTTP ${response.status}`,
  );
  response = await request('/auth/logout-all', { method: 'POST', cookie: technicianCookie });
  record('Clave temporal puede cerrar todas las sesiones', response.ok, `HTTP ${response.status}`);
  await prisma.user.update({
    where: { id: forcedPasswordChangeUserId },
    data: { mustChangePassword: false },
  });
  forcedPasswordChangeUserId = undefined;

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
  if (redisConnected) {
    if (pendingRegistrationCooldownKey) {
      await redis.del(pendingRegistrationCooldownKey).catch(() => undefined);
    }
    await redis.quit().catch(() => redis.disconnect());
  }
  if (adminPasswordState) {
    await prisma.user
      .update({
        where: { id: adminPasswordState.id },
        data: { mustChangePassword: adminPasswordState.mustChangePassword },
      })
      .catch(() => undefined);
  }
  if (forcedPasswordChangeUserId) {
    await prisma.user
      .update({ where: { id: forcedPasswordChangeUserId }, data: { mustChangePassword: false } })
      .catch(() => undefined);
  }
  await prisma.appointment
    .deleteMany({ where: { notes: { startsWith: marker } } })
    .catch(() => undefined);
  if (quoteIds.length) {
    await prisma.customQuote.deleteMany({ where: { id: { in: quoteIds } } }).catch(() => undefined);
    await prisma.notification
      .deleteMany({ where: { OR: quoteIds.map((id) => ({ dedupeKey: { contains: id } })) } })
      .catch(() => undefined);
  }
  if (sessionHashes.length) {
    await prisma.session
      .deleteMany({ where: { tokenHash: { in: sessionHashes } } })
      .catch(() => undefined);
  }
  if (pendingRegistrationUserId) {
    await prisma.auditLog
      .deleteMany({
        where: {
          OR: [
            { actorUserId: pendingRegistrationUserId },
            { entityType: 'User', entityId: pendingRegistrationUserId },
          ],
        },
      })
      .catch(() => undefined);
    await prisma.user.delete({ where: { id: pendingRegistrationUserId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
}

for (const result of results) {
  console.log(`${result.ok ? 'OK' : 'FAIL'} | ${result.name} | ${result.detail}`);
}
if (failed) process.exitCode = 1;
