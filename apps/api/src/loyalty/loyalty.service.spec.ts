import { describe, expect, it, vi } from 'vitest';

import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService profile', () => {
  it('calcula el total global aunque el historial visible esté limitado a 50 entradas', async () => {
    const visitEntries = Array.from({ length: 50 }, (_, index) => ({
      id: `visit-${index}`,
      delta: 1,
      appointment: null,
      createdBy: null,
      createdAt: new Date(),
    }));
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'client-id',
          fullName: 'Cliente',
          phone: '+529990000000',
          visitEntries,
          rewardCoupons: [],
        }),
      },
      rewardRule: { findMany: vi.fn().mockResolvedValue([]) },
      clientVisitEntry: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 75 } }),
      },
    };
    const service = new LoyaltyService(prisma as never, {} as never, {} as never);

    const profile = await service.myProfile({
      id: 'client-id',
      role: 'CLIENT',
      status: 'ACTIVE',
      fullName: 'Cliente',
      phone: '+529990000000',
      email: null,
      mustChangePassword: false,
    });

    expect(profile.visitCount).toBe(75);
    expect(profile.visitHistory).toHaveLength(50);
    expect(prisma.clientVisitEntry.aggregate).toHaveBeenCalledWith({
      where: { clientId: 'client-id' },
      _sum: { delta: true },
    });
  });
});
