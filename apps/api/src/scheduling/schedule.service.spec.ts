import { describe, expect, it, vi } from 'vitest';

import { ScheduleService } from './schedule.service';

describe('ScheduleService removeOverride', () => {
  it('valida que la técnica exista antes de borrar o consultar advertencias', async () => {
    const deleteMany = vi.fn();
    const prisma = {
      user: { count: vi.fn().mockResolvedValue(0) },
      scheduleDayOverride: { deleteMany },
    };
    const time = { assertDate: vi.fn(), databaseDate: vi.fn() };
    const service = new ScheduleService(prisma as never, time as never);

    await expect(service.removeOverride('missing-tech', '2026-08-15')).rejects.toThrow();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(time.assertDate).not.toHaveBeenCalled();
  });
});
