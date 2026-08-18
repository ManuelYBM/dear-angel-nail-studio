import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackgroundJobsController } from './background-jobs.controller';

const original = { ...process.env };

describe('BackgroundJobsController', () => {
  afterEach(() => {
    process.env = { ...original };
  });

  it('rechaza llamadas sin el secreto compartido correcto', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WORKER_SHARED_SECRET = 'worker-secret-with-more-than-thirty-two-characters';
    const controller = new BackgroundJobsController({} as never, {} as never, {} as never);

    await expect(controller.run('payment-expiry')).rejects.toThrow();
    await expect(controller.run('payment-expiry', 'incorrecto')).rejects.toThrow();
  });

  it('ejecuta solamente el trabajo solicitado con un token válido', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WORKER_SHARED_SECRET = 'worker-secret-with-more-than-thirty-two-characters';
    const notifications = {
      processPending: vi.fn(),
      queueAppointmentReminders: vi.fn(),
    };
    const payments = {
      expireAwaitingReceipts: vi.fn().mockResolvedValue({ expired: 2 }),
      purgeExpiredReceiptFiles: vi.fn(),
    };
    const pendingRegistrations = {
      purgeExpired: vi.fn().mockResolvedValue({ expiredRegistrationsDeleted: 4 }),
    };
    const controller = new BackgroundJobsController(
      notifications as never,
      payments as never,
      pendingRegistrations as never,
    );

    await expect(
      controller.run('payment-expiry', process.env.WORKER_SHARED_SECRET),
    ).resolves.toEqual({ job: 'payment-expiry', expired: 2 });
    expect(payments.expireAwaitingReceipts).toHaveBeenCalledOnce();
    expect(notifications.processPending).not.toHaveBeenCalled();

    await expect(
      controller.run('pending-registration-cleanup', process.env.WORKER_SHARED_SECRET),
    ).resolves.toEqual({
      job: 'pending-registration-cleanup',
      expiredRegistrationsDeleted: 4,
    });
  });
});
