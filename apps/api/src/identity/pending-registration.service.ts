import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';

import { PrismaService } from '../infrastructure/prisma.service';

const REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;

type ExpirableRegistration = Pick<
  User,
  'id' | 'role' | 'status' | 'phoneVerifiedAt' | 'registrationExpiresAt'
>;

@Injectable()
export class PendingRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  expirationFrom(now = new Date()): Date {
    return new Date(now.getTime() + REGISTRATION_TTL_MS);
  }

  isExpired(user: ExpirableRegistration, now = new Date()): boolean {
    return Boolean(
      user.role === 'CLIENT' &&
      user.status === 'PENDING_VERIFICATION' &&
      !user.phoneVerifiedAt &&
      user.registrationExpiresAt &&
      user.registrationExpiresAt.getTime() <= now.getTime(),
    );
  }

  async discardExpiredForPhone(phone: string, now = new Date()): Promise<number> {
    const result = await this.prisma.user.deleteMany({
      where: {
        phone,
        role: 'CLIENT',
        status: 'PENDING_VERIFICATION',
        phoneVerifiedAt: null,
        registrationExpiresAt: { lte: now },
        ...this.withoutBusinessRelations,
      },
    });
    return result.count;
  }

  async discardIfExpired(user: ExpirableRegistration, now = new Date()): Promise<boolean> {
    if (!this.isExpired(user, now)) return false;
    await this.prisma.user.deleteMany({
      where: {
        id: user.id,
        role: 'CLIENT',
        status: 'PENDING_VERIFICATION',
        phoneVerifiedAt: null,
        registrationExpiresAt: { lte: now },
        ...this.withoutBusinessRelations,
      },
    });
    return true;
  }

  async discardFailedRegistration(userId: string, expiration: Date): Promise<void> {
    await this.prisma.user.deleteMany({
      where: {
        id: userId,
        role: 'CLIENT',
        status: 'PENDING_VERIFICATION',
        phoneVerifiedAt: null,
        registrationExpiresAt: expiration,
      },
    });
  }

  async purgeExpired(now = new Date()): Promise<{ expiredRegistrationsDeleted: number }> {
    const result = await this.prisma.user.deleteMany({
      where: {
        role: 'CLIENT',
        status: 'PENDING_VERIFICATION',
        phoneVerifiedAt: null,
        registrationExpiresAt: { lte: now },
        ...this.withoutBusinessRelations,
      },
    });
    return { expiredRegistrationsDeleted: result.count };
  }

  private readonly withoutBusinessRelations: Prisma.UserWhereInput = {
    clientAppointments: { none: {} },
    clientQuotes: { none: {} },
    catalogFavorites: { none: {} },
    visitEntries: { none: {} },
    rewardCoupons: { none: {} },
    notifications: { none: {} },
  };
}
