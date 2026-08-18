import { BadRequestException, GoneException, Injectable } from '@nestjs/common';
import type {
  ChallengePurpose,
  DeliveryChannel,
  User,
  VerificationChallenge,
} from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { canExposeMockOtpCode } from '../common/environment';
import { TooManyRequestsException } from '../common/too-many-requests.exception';
import { PrismaService } from '../infrastructure/prisma.service';
import { RedisService } from '../infrastructure/redis.service';
import { MessagingService } from './messaging.service';
import { PhoneService } from './phone.service';

const EXPIRY_SECONDS = 10 * 60;
const COOLDOWN_SECONDS = 60;

export interface ChallengeIssueResult {
  challengeId: string;
  expiresInSeconds: number;
  destination: string;
  provider: string;
  debugCode?: string;
}

@Injectable()
export class ChallengeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly messaging: MessagingService,
    private readonly phones: PhoneService,
  ) {}

  async issue(
    user: User,
    purpose: ChallengePurpose,
    channel: DeliveryChannel,
    destination: string,
  ): Promise<ChallengeIssueResult> {
    const cooldownKey = `identity:challenge:${user.id}:${purpose}`;
    const acquired = await this.redis.client.set(cooldownKey, '1', 'EX', COOLDOWN_SECONDS, 'NX');
    if (acquired !== 'OK') {
      throw new TooManyRequestsException({
        code: 'CODE_COOLDOWN',
        message: 'Espera un minuto antes de solicitar otro código.',
      });
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const issuedAt = Date.now();
    const registrationDeadline = user.registrationExpiresAt?.getTime();
    if (registrationDeadline !== undefined && registrationDeadline <= issuedAt) {
      await this.redis.client.del(cooldownKey);
      throw new GoneException({
        code: 'REGISTRATION_EXPIRED',
        message: 'Este registro caducó. Crea tu cuenta nuevamente.',
      });
    }
    const expiresAt = new Date(
      Math.min(issuedAt + EXPIRY_SECONDS * 1000, registrationDeadline ?? Number.POSITIVE_INFINITY),
    );
    await this.prisma.verificationChallenge.updateMany({
      where: { userId: user.id, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const challenge = await this.prisma.verificationChallenge.create({
      data: {
        userId: user.id,
        purpose,
        channel,
        destination,
        codeHash: this.hashCode(code),
        expiresAt,
      },
    });

    try {
      const receipt = await this.messaging.sendCode(channel, destination, code, purpose);
      return {
        challengeId: challenge.id,
        expiresInSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
        destination:
          channel === 'WHATSAPP' ? this.phones.mask(destination) : this.maskEmail(destination),
        provider: receipt.provider,
        ...(canExposeMockOtpCode() && receipt.debugCode ? { debugCode: receipt.debugCode } : {}),
      };
    } catch (error) {
      await Promise.all([
        this.prisma.verificationChallenge.delete({ where: { id: challenge.id } }),
        this.redis.client.del(cooldownKey),
      ]);
      throw error;
    }
  }

  async resumeOrIssue(
    user: User,
    purpose: ChallengePurpose,
    channel: DeliveryChannel,
    destination: string,
  ): Promise<ChallengeIssueResult> {
    try {
      return await this.issue(user, purpose, channel, destination);
    } catch (error) {
      if (!this.isCooldown(error)) throw error;

      const now = new Date();
      const challenge = await this.prisma.verificationChallenge.findFirst({
        where: {
          userId: user.id,
          purpose,
          channel,
          destination,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!challenge) throw error;

      return {
        challengeId: challenge.id,
        expiresInSeconds: Math.max(
          1,
          Math.ceil((challenge.expiresAt.getTime() - now.getTime()) / 1000),
        ),
        destination:
          channel === 'WHATSAPP' ? this.phones.mask(destination) : this.maskEmail(destination),
        provider: 'pending',
      };
    }
  }

  async consume(
    challengeId: string,
    code: string,
    purpose: ChallengePurpose,
  ): Promise<VerificationChallenge & { user: User }> {
    while (true) {
      const challenge = await this.prisma.verificationChallenge.findUnique({
        where: { id: challengeId },
        include: { user: true },
      });
      if (!challenge || challenge.purpose !== purpose || challenge.consumedAt) {
        throw new BadRequestException({
          code: 'INVALID_CODE',
          message: 'El código no es válido.',
        });
      }

      const now = new Date();
      if (challenge.expiresAt.getTime() <= now.getTime()) {
        throw new GoneException({ code: 'CODE_EXPIRED', message: 'El código ya caducó.' });
      }
      if (challenge.attempts >= challenge.maxAttempts) {
        throw new TooManyRequestsException({
          code: 'CODE_ATTEMPTS_EXCEEDED',
          message: 'El código fue bloqueado. Solicita uno nuevo.',
        });
      }

      if (!this.matches(code, challenge.codeHash)) {
        const nextAttempts = challenge.attempts + 1;
        const updated = await this.prisma.verificationChallenge.updateMany({
          where: {
            id: challenge.id,
            purpose,
            consumedAt: null,
            expiresAt: { gt: now },
            attempts: challenge.attempts,
          },
          data: {
            attempts: { increment: 1 },
            consumedAt: nextAttempts >= challenge.maxAttempts ? now : undefined,
          },
        });
        if (updated.count !== 1) continue;
        throw new BadRequestException({
          code: 'INVALID_CODE',
          message: 'El código no es válido.',
        });
      }

      const consumed = await this.prisma.verificationChallenge.updateMany({
        where: {
          id: challenge.id,
          purpose,
          consumedAt: null,
          expiresAt: { gt: now },
          attempts: challenge.attempts,
        },
        data: { consumedAt: now },
      });
      if (consumed.count === 1) return challenge;
    }
  }

  private hashCode(code: string): string {
    const pepper = process.env.OTP_PEPPER || 'dear-angel-local-otp-pepper';
    return createHmac('sha256', pepper).update(code).digest('base64url');
  }

  private isCooldown(error: unknown): error is TooManyRequestsException {
    if (!(error instanceof TooManyRequestsException)) return false;
    const response = error.getResponse();
    return (
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      response.code === 'CODE_COOLDOWN'
    );
  }

  private matches(code: string, expected: string): boolean {
    const actualBuffer = Buffer.from(this.hashCode(code));
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private maskEmail(value: string): string {
    const [name = '', domain = ''] = value.split('@');
    return `${name.slice(0, 2)}•••@${domain}`;
  }
}
