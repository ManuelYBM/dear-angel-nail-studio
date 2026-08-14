import { PrismaClient } from '@prisma/client';
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { addDays, subDays } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { Client as MinioClient } from 'minio';

if (process.env.DEMO_DATA_ENABLED !== 'true') {
  throw new Error('Para evitar datos accidentales, ejecuta con DEMO_DATA_ENABLED=true.');
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://dear_angel:dear_angel_local_password@127.0.0.1:5432/dear_angel?schema=public',
    },
  },
});
const derive = promisify(scrypt);
const timeZone = 'America/Merida';
const demoPassword = process.env.DEMO_INITIAL_PASSWORD ?? 'DearAngelDemo2026';
const minioBucket = process.env.MINIO_BUCKET ?? 'dear-angel-private';
const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT ?? '127.0.0.1',
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? 'dear_angel',
  secretKey:
    process.env.MINIO_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? 'dear_angel_minio_password',
});
const demoReceipt = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function passwordHash(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', 'v1', 16_384, 8, 1, salt.toString('base64url'), key.toString('base64url')].join(
    '$',
  );
}

function localAt(date, hour, minute = 0) {
  const key = date.toISOString().slice(0, 10);
  return fromZonedTime(
    `${key}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    timeZone,
  );
}

async function upsertPerson(data) {
  const existing = await prisma.user.findFirst({
    where: data.email ? { email: data.email } : { phone: data.phone },
  });
  if (existing) return existing;
  return prisma.user.create({ data: { ...data, passwordHash: await passwordHash(demoPassword) } });
}

async function ensureAppointment(data, marker) {
  const existing = await prisma.appointment.findFirst({ where: { notes: marker } });
  if (existing) return existing;
  return prisma.appointment.create({ data: { ...data, notes: marker } });
}

try {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  if (!admin) throw new Error('Primero inicia la aplicación para crear la administradora.');

  const techs = [];
  for (const [index, fullName] of ['Mariana Demo', 'Renata Demo'].entries()) {
    const technician = await upsertPerson({
      role: 'NAIL_TECHNICIAN',
      status: 'ACTIVE',
      fullName,
      sex: 'FEMALE',
      email: `demo.manicurista${index + 1}@dearangel.local`,
      emailVerifiedAt: new Date(),
      mustChangePassword: false,
    });
    await prisma.technicianSchedule.upsert({
      where: { technicianId: technician.id },
      create: { technicianId: technician.id, usesGlobalSchedule: true, acceptingBookings: true },
      update: { acceptingBookings: true },
    });
    techs.push(technician);
  }

  const clientSpecs = [
    ['Valeria Demo', 'FEMALE', '+529990000101'],
    ['Sofía Demo', 'FEMALE', '+529990000102'],
    ['Alex Demo', 'PREFER_NOT_TO_SAY', '+529990000103'],
  ];
  const clients = [];
  for (const [fullName, sex, phone] of clientSpecs) {
    clients.push(
      await upsertPerson({
        role: 'CLIENT',
        status: 'ACTIVE',
        fullName,
        sex,
        phone,
        phoneVerifiedAt: new Date(),
        mustChangePassword: false,
      }),
    );
  }

  const designs = await prisma.catalogDesign.findMany({
    where: { published: true },
    orderBy: { sortOrder: 'asc' },
  });
  const today = new Date();
  const pastStatuses = [
    'COMPLETED',
    'COMPLETED',
    'NO_SHOW',
    'COMPLETED',
    'CANCELLED',
    'COMPLETED',
    'COMPLETED',
    'NO_SHOW',
    'COMPLETED',
    'CANCELLED',
    'COMPLETED',
    'COMPLETED',
  ];
  const createdAppointments = [];
  for (let index = 0; index < pastStatuses.length; index += 1) {
    const status = pastStatuses[index];
    const startAt = localAt(subDays(today, index + 1), 10 + (index % 3) * 2);
    const marker = `[DEMO:PAST:${index + 1}]`;
    const appointment = await ensureAppointment(
      {
        technicianId: techs[index % techs.length].id,
        clientId: clients[index % clients.length].id,
        createdByUserId: admin.id,
        catalogDesignId: designs.length ? designs[index % designs.length].id : null,
        source: 'MANUAL',
        status,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
        durationMinutes: 60,
        completedAt: status === 'COMPLETED' ? new Date(startAt.getTime() + 60 * 60 * 1000) : null,
        cancelledAt:
          status === 'CANCELLED' ? new Date(startAt.getTime() - 24 * 60 * 60 * 1000) : null,
      },
      marker,
    );
    createdAppointments.push(appointment);
    if (status === 'COMPLETED') {
      await prisma.clientVisitEntry.upsert({
        where: { appointmentId: appointment.id },
        create: {
          clientId: appointment.clientId,
          appointmentId: appointment.id,
          delta: 1,
          reason: 'APPOINTMENT_COMPLETED',
          note: 'Visita demostrativa',
          createdByUserId: admin.id,
        },
        update: {},
      });
    }
  }

  const paymentSettings = await prisma.paymentSettings.findUniqueOrThrow({
    where: { id: 'default' },
  });
  for (let index = 0; index < 3; index += 1) {
    const startAt = localAt(addDays(today, index + 2), 10 + index * 2);
    const status = index === 2 ? 'PENDING_PAYMENT' : 'CONFIRMED';
    const appointment = await ensureAppointment(
      {
        technicianId: techs[index % techs.length].id,
        clientId: clients[index].id,
        createdByUserId: clients[index].id,
        catalogDesignId: designs.length ? designs[index % designs.length].id : null,
        source: 'ONLINE',
        status,
        startAt,
        endAt: new Date(startAt.getTime() + 75 * 60 * 1000),
        durationMinutes: 75,
      },
      `[DEMO:FUTURE:${index + 1}]`,
    );
    const objectKey = `deposits/demo/comprobante-${index + 1}.png`;
    await minio.putObject(minioBucket, objectKey, demoReceipt, demoReceipt.length, {
      'Content-Type': 'image/png',
      demo: 'true',
    });
    const acceptedAt = new Date();
    await prisma.depositPayment.upsert({
      where: { appointmentId: appointment.id },
      create: {
        appointmentId: appointment.id,
        reference: `DA-DEMO-${index + 1}`,
        amountCents: paymentSettings.amountCents,
        status: index === 2 ? 'PENDING_REVIEW' : 'APPROVED',
        recipientNameSnapshot: paymentSettings.recipientName,
        bankNameSnapshot: paymentSettings.bankName,
        clabeSnapshot: paymentSettings.clabe,
        accountNumberSnapshot: paymentSettings.accountNumber,
        transferNotesSnapshot: paymentSettings.transferNotes,
        objectKey,
        mimeType: 'image/png',
        filename: `comprobante-demo-${index + 1}.png`,
        sizeBytes: demoReceipt.length,
        receiptUploadedAt: acceptedAt,
        retentionUntil: addDays(acceptedAt, 365),
        acceptedPolicyVersion: paymentSettings.policyVersion,
        acceptedPoliciesAt: acceptedAt,
        reviewedByUserId: index === 2 ? null : admin.id,
        reviewedAt: index === 2 ? null : new Date(),
        confirmationCode: index === 2 ? null : `DEMO-${index + 1}-OK`,
      },
      update: {},
    });
  }

  const reward = await prisma.rewardRule.findFirst({
    where: { active: true },
    orderBy: { visitNumber: 'asc' },
  });
  if (reward) {
    await prisma.clientCoupon.upsert({
      where: { clientId_rewardRuleId: { clientId: clients[0].id, rewardRuleId: reward.id } },
      create: {
        clientId: clients[0].id,
        rewardRuleId: reward.id,
        source: 'VISIT_REWARD',
        status: 'AVAILABLE',
        title: reward.title,
        description: reward.description,
        iconText: reward.iconText,
        issuedByUserId: admin.id,
      },
      update: {},
    });
  }

  console.log('Datos demostrativos listos.');
  console.log('Manicurista: demo.manicurista1@dearangel.local');
  console.log('Cliente: +529990000101');
  console.log(`Contraseña local: ${demoPassword}`);
} finally {
  await prisma.$disconnect();
}
