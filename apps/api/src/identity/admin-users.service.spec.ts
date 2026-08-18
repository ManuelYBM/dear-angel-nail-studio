import { describe, expect, it, vi } from 'vitest';

import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  it('no presenta autorregistros temporales como cuentas administrativas', async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const service = new AdminUsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.list({ page: 1, pageSize: 20 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { registrationExpiresAt: null } }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { registrationExpiresAt: null },
    });
  });
});
