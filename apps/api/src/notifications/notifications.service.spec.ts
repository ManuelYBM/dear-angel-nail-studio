import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationsService } from './notifications.service';

interface StaleRecoveryInput {
  where: {
    status: string;
    lockedAt: { lt: Date };
    attempts?: unknown;
  };
  data: {
    status: string;
    lockedAt: Date | null;
    nextAttemptAt: Date;
  };
}

describe('NotificationsService background jobs', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('libera entregas PROCESSING vencidas incluso después del quinto intento', async () => {
    const updateMany = vi
      .fn<(input: StaleRecoveryInput) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 });
    const prisma = {
      notificationDelivery: {
        updateMany,
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new NotificationsService(prisma as never, {} as never);

    await service.processPending();

    const staleRecovery = updateMany.mock.calls[0]?.[0];
    expect(staleRecovery).toMatchObject({
      where: { status: 'PROCESSING' },
      data: { status: 'FAILED', lockedAt: null },
    });
    expect(staleRecovery?.where.lockedAt.lt).toBeInstanceOf(Date);
    expect(staleRecovery?.data.nextAttemptAt).toBeInstanceOf(Date);
    expect(staleRecovery?.where).not.toHaveProperty('attempts');
  });

  it('agenda el recordatorio de 24h durante toda la franja previa a 2h', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'));
    const startAt = new Date('2026-08-15T00:00:00.000Z');
    const prisma = {
      appointment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'appointment-id',
            startAt,
            clientId: 'client-id',
            technicianId: 'technician-id',
            client: { id: 'client-id' },
            technician: { id: 'technician-id', fullName: 'Técnica' },
          },
        ]),
      },
    };
    const service = new NotificationsService(prisma as never, {} as never);
    const notify = vi.spyOn(service, 'notify').mockResolvedValue(null);

    await service.queueAppointmentReminders();

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'client-id',
        dedupeKey: `reminder:24h:appointment-id:${startAt.toISOString()}:client`,
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'technician-id',
        dedupeKey: `reminder:24h:appointment-id:${startAt.toISOString()}:technician`,
      }),
    );
  });
});
