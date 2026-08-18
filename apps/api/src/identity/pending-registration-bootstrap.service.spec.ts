import { afterEach, describe, expect, it, vi } from 'vitest';

import { PendingRegistrationBootstrapService } from './pending-registration-bootstrap.service';

const original = { ...process.env };

describe('PendingRegistrationBootstrapService', () => {
  afterEach(() => {
    process.env = { ...original };
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('delega la limpieza al worker de forma predeterminada', async () => {
    vi.useFakeTimers();
    delete process.env.BACKGROUND_JOBS_MODE;
    const pendingRegistrations = { purgeExpired: vi.fn() };
    const service = new PendingRegistrationBootstrapService(pendingRegistrations as never);

    await service.onModuleInit();

    expect(pendingRegistrations.purgeExpired).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('programa la limpieza horaria cuando se elige el modo API', async () => {
    vi.useFakeTimers();
    process.env.BACKGROUND_JOBS_MODE = 'api';
    const pendingRegistrations = {
      purgeExpired: vi.fn().mockResolvedValue({ expiredRegistrationsDeleted: 0 }),
    };
    const service = new PendingRegistrationBootstrapService(pendingRegistrations as never);

    await service.onModuleInit();

    expect(pendingRegistrations.purgeExpired).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    service.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
