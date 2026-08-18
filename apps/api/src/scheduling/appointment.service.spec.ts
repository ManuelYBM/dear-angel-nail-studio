import { describe, expect, it, vi } from 'vitest';

import { AppointmentService } from './appointment.service';

const policy = {
  id: 'default',
  defaultDurationMinutes: 60,
  slotIntervalMinutes: 15,
  minimumLeadMinutes: 60,
  maximumAdvanceDays: 14,
  holdMinutes: 10,
  rescheduleNoticeHours: 24,
  clientRescheduleLimit: 1,
};

function appointment() {
  const startAt = new Date(Date.now() + 3 * 24 * 60 * 60_000);
  startAt.setUTCSeconds(0, 0);
  return {
    id: 'appointment-id',
    technicianId: 'tech-id',
    clientId: 'client-id',
    createdByUserId: 'client-id',
    customQuoteId: null,
    catalogDesignId: null,
    source: 'ONLINE',
    status: 'CONFIRMED',
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60_000),
    durationMinutes: 60,
    holdExpiresAt: null,
    clientRescheduleCount: 0,
    guestName: null,
    guestPhone: null,
    notes: null,
    cancelledAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date('2026-08-14T12:00:00.000Z'),
  };
}

function service(prisma: object, schedules: object) {
  const payments = {
    expireAwaitingReceipts: vi.fn().mockResolvedValue({ expired: 0 }),
    cancelForAppointment: vi.fn(),
  };
  return {
    payments,
    instance: new AppointmentService(
      prisma as never,
      schedules as never,
      { minuteOfDay: vi.fn().mockReturnValue(0) } as never,
      {} as never,
      { record: vi.fn() } as never,
      {} as never,
      payments as never,
      { notify: vi.fn() } as never,
      {} as never,
    ),
  };
}

const admin = {
  id: 'admin-id',
  role: 'ADMIN',
  status: 'ACTIVE',
  fullName: 'Admin',
  phone: null,
  email: 'admin@example.com',
  mustChangePassword: false,
};

describe('AppointmentService integration rules', () => {
  it('valida siempre que la técnica final siga activa y aceptando citas', async () => {
    const current = appointment();
    const prisma = { appointment: { findUnique: vi.fn().mockResolvedValue(current) } };
    const schedules = {
      getPolicy: vi.fn().mockResolvedValue(policy),
      activeTechnicians: vi.fn().mockResolvedValue([]),
    };
    const { instance } = service(prisma, schedules);

    await expect(
      instance.reschedule(
        admin as never,
        current.id,
        { startAt: new Date(current.startAt.getTime() + 60 * 60_000).toISOString() },
        {} as never,
      ),
    ).rejects.toThrow();
    expect(schedules.activeTechnicians).toHaveBeenCalledWith('tech-id');
  });

  it('no permite que una clienta reasigne technicianId', async () => {
    const current = appointment();
    const prisma = { appointment: { findUnique: vi.fn().mockResolvedValue(current) } };
    const schedules = {
      getPolicy: vi.fn().mockResolvedValue(policy),
      activeTechnicians: vi.fn(),
    };
    const { instance } = service(prisma, schedules);

    await expect(
      instance.reschedule(
        { ...admin, id: 'client-id', role: 'CLIENT' } as never,
        current.id,
        {
          startAt: new Date(current.startAt.getTime() + 60 * 60_000).toISOString(),
          technicianId: 'other-tech-id',
        },
        {} as never,
      ),
    ).rejects.toThrow();
    expect(schedules.activeTechnicians).not.toHaveBeenCalled();
  });

  it('rechaza una reprogramación si la cita cambió desde la lectura', async () => {
    const current = appointment();
    const updateMany = vi
      .fn<
        (input: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{
          count: number;
        }>
      >()
      .mockResolvedValue({ count: 0 });
    const tx = { appointment: { updateMany, findUniqueOrThrow: vi.fn() } };
    const prisma = {
      appointment: { findUnique: vi.fn().mockResolvedValue(current) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const schedules = {
      getPolicy: vi.fn().mockResolvedValue(policy),
      activeTechnicians: vi.fn().mockResolvedValue([{ id: 'tech-id', fullName: 'Técnica' }]),
      isWithinAvailability: vi.fn().mockResolvedValue(true),
    };
    const { instance } = service(prisma, schedules);

    await expect(
      instance.reschedule(
        admin as never,
        current.id,
        { startAt: new Date(current.startAt.getTime() + 60 * 60_000).toISOString() },
        {} as never,
      ),
    ).rejects.toThrow();
    expect(updateMany.mock.calls[0]?.[0].where).toMatchObject({
      updatedAt: current.updatedAt,
      status: 'CONFIRMED',
    });
  });

  it('mantiene el límite histórico de 300 cuando un consumidor no pagina', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { appointment: { findMany } };
    const schedules = { getPolicy: vi.fn().mockResolvedValue(policy) };
    const { instance } = service(prisma, schedules);

    await instance.list(admin as never, {});

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 301 }));
  });

  it('pagina de forma estable y entrega el cursor de la siguiente tanda', async () => {
    const item = (id: string, startAt: string) => ({
      ...appointment(),
      id,
      startAt: new Date(startAt),
      endAt: new Date(new Date(startAt).getTime() + 60 * 60_000),
      technician: { id: 'tech-id', fullName: 'Técnica' },
      client: null,
      depositPayment: null,
    });
    const newest = item('00000000-0000-4000-8000-000000000003', '2026-08-17T18:00:00Z');
    const middle = item('00000000-0000-4000-8000-000000000002', '2026-08-16T18:00:00Z');
    const extra = item('00000000-0000-4000-8000-000000000001', '2026-08-15T18:00:00Z');
    const findMany = vi.fn().mockResolvedValue([newest, middle, extra]);
    const prisma = { appointment: { findMany } };
    const schedules = { getPolicy: vi.fn().mockResolvedValue(policy) };
    const { instance } = service(prisma, schedules);

    const result = await instance.list(admin as never, {
      limit: 2,
      cursor: '10000000-0000-4000-8000-000000000000',
    });

    expect(result.items.map(({ id }) => id)).toEqual([middle.id, newest.id]);
    expect(result.nextCursor).toBe(middle.id);
    expect(result.policy).toBe(policy);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
        take: 3,
        cursor: { id: '10000000-0000-4000-8000-000000000000' },
        skip: 1,
      }),
    );
  });

  it('conserva la técnica que aprobó una cotización al reprogramar', async () => {
    const current = { ...appointment(), customQuoteId: 'quote-id' };
    const prisma = {
      appointment: { findUnique: vi.fn().mockResolvedValue(current) },
      customQuote: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'APPROVED',
          assignedTechnicianId: 'other-tech-id',
        }),
      },
    };
    const schedules = {
      getPolicy: vi.fn().mockResolvedValue(policy),
      activeTechnicians: vi.fn().mockResolvedValue([{ id: 'tech-id', fullName: 'Técnica' }]),
      isWithinAvailability: vi.fn(),
    };
    const { instance } = service(prisma, schedules);

    await expect(
      instance.reschedule(
        admin as never,
        current.id,
        { startAt: new Date(current.startAt.getTime() + 60 * 60_000).toISOString() },
        {} as never,
      ),
    ).rejects.toThrow();
    expect(schedules.isWithinAvailability).not.toHaveBeenCalled();
  });

  it('no cierra usando horarios obsoletos si la cita fue reprogramada en paralelo', async () => {
    const current = appointment();
    current.startAt = new Date(Date.now() - 2 * 60 * 60_000);
    current.endAt = new Date(Date.now() - 60 * 60_000);
    const updateMany = vi
      .fn<
        (input: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{
          count: number;
        }>
      >()
      .mockResolvedValue({ count: 0 });
    const tx = { appointment: { updateMany, findUniqueOrThrow: vi.fn() } };
    const prisma = {
      appointment: { findUnique: vi.fn().mockResolvedValue(current) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const { instance } = service(prisma, {});

    await expect(
      instance.updateStatus(admin as never, current.id, 'COMPLETED', {} as never),
    ).rejects.toThrow();
    expect(updateMany.mock.calls[0]?.[0].where).toMatchObject({ updatedAt: current.updatedAt });
  });
});
