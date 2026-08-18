import { afterEach, describe, expect, it, vi } from 'vitest';

import { BootstrapPaymentsService } from './bootstrap-payments.service';

const original = { ...process.env };

describe('BootstrapPaymentsService', () => {
  afterEach(() => {
    process.env = { ...original };
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('delega los trabajos al worker de forma predeterminada', async () => {
    vi.useFakeTimers();
    delete process.env.BACKGROUND_JOBS_MODE;
    const prisma = {
      paymentSettings: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const payments = {
      expireAwaitingReceipts: vi.fn(),
      purgeExpiredReceiptFiles: vi.fn(),
    };
    const service = new BootstrapPaymentsService(prisma as never, payments as never);

    await service.onModuleInit();

    expect(prisma.paymentSettings.upsert).toHaveBeenCalledOnce();
    expect(payments.expireAwaitingReceipts).not.toHaveBeenCalled();
    expect(payments.purgeExpiredReceiptFiles).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('programa vencimiento y retención cuando se elige el modo API', async () => {
    vi.useFakeTimers();
    process.env.BACKGROUND_JOBS_MODE = 'api';
    const prisma = {
      paymentSettings: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const payments = {
      expireAwaitingReceipts: vi.fn().mockResolvedValue({ expired: 0 }),
      purgeExpiredReceiptFiles: vi.fn().mockResolvedValue({ purged: 0 }),
    };
    const service = new BootstrapPaymentsService(prisma as never, payments as never);

    await service.onModuleInit();

    expect(payments.expireAwaitingReceipts).toHaveBeenCalledOnce();
    expect(payments.purgeExpiredReceiptFiles).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(2);
    service.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
