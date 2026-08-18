import { describe, expect, it, vi } from 'vitest';

import { PaymentsService } from './payments.service';

describe('PaymentsService review concurrency', () => {
  it('bloquea primero la versión observada de la cita y no revisa un anticipo obsoleto', async () => {
    const current = {
      id: 'deposit-id',
      appointmentId: 'appointment-id',
      status: 'PENDING_REVIEW',
      reference: 'DA-260814-ABC123',
      appointment: {
        id: 'appointment-id',
        status: 'PENDING_PAYMENT',
        technicianId: 'tech-id',
        startAt: new Date('2026-08-15T18:00:00.000Z'),
        endAt: new Date('2026-08-15T19:00:00.000Z'),
      },
    };
    const depositUpdate = vi.fn();
    const tx = {
      appointment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      depositPayment: { updateMany: depositUpdate, findUniqueOrThrow: vi.fn() },
    };
    const prisma = {
      depositPayment: { findUnique: vi.fn().mockResolvedValue(current) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new PaymentsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.review({} as never, 'deposit-id', { decision: 'APPROVED' }, {} as never),
    ).rejects.toThrow();

    expect(tx.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'appointment-id',
        status: 'PENDING_PAYMENT',
        technicianId: 'tech-id',
        startAt: current.appointment.startAt,
        endAt: current.appointment.endAt,
      },
      data: {
        status: 'CONFIRMED',
        holdExpiresAt: null,
        cancelledAt: null,
      },
    });
    expect(depositUpdate).not.toHaveBeenCalled();
  });
});
