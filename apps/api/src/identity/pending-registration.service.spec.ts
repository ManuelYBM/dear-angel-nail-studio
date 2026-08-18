import { describe, expect, it, vi } from 'vitest';

import { PendingRegistrationService } from './pending-registration.service';

function pendingRegistration(expiresAt: Date | null) {
  return {
    id: 'user-id',
    role: 'CLIENT',
    status: 'PENDING_VERIFICATION',
    phoneVerifiedAt: null,
    registrationExpiresAt: expiresAt,
  } as const;
}

describe('PendingRegistrationService', () => {
  it('da 24 horas para completar un autorregistro', () => {
    const service = new PendingRegistrationService({} as never);
    const now = new Date('2026-08-14T12:00:00.000Z');

    expect(service.expirationFrom(now).toISOString()).toBe('2026-08-15T12:00:00.000Z');
  });

  it('nunca considera desechable un pendiente sin caducidad', () => {
    const service = new PendingRegistrationService({} as never);

    expect(service.isExpired(pendingRegistration(null))).toBe(false);
  });

  it('purga sólo autorregistros vencidos y sin relaciones de negocio', async () => {
    const prisma = {
      user: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    };
    const service = new PendingRegistrationService(prisma as never);
    const now = new Date('2026-08-14T12:00:00.000Z');

    await expect(service.purgeExpired(now)).resolves.toEqual({
      expiredRegistrationsDeleted: 3,
    });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        role: 'CLIENT',
        status: 'PENDING_VERIFICATION',
        phoneVerifiedAt: null,
        registrationExpiresAt: { lte: now },
        clientAppointments: { none: {} },
        clientQuotes: { none: {} },
      }) as unknown,
    });
  });
});
