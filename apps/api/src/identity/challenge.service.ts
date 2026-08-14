import { BadRequestException, GoneException, Injectable } from '@nestjs/common';
import type {
  ChallengePurpose,
  DeliveryChannel,
  User,
  VerificationChallenge,
} from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../infrastructure/prisma.service';
import { RedisService } from '../infrastructure/redis.service';
import { TooManyRequestsException } from '../common/too-many-requests.exception';
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
    const expiresAt = new Date(Date.now() + EXPIRY_SECONDS * 1000);
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
        expiresInSeconds: EXPIRY_SECONDS,
        destination:
          channel === 'WHATSAPP' ? this.phones.mask(destination) : this.maskEmail(destination),
        provider: receipt.provider,
        debugCode: receipt.debugCode,
      };
    } catch (error) {
      await Promise.all([
        this.prisma.verificationChallenge.delete({ where: { id: challenge.id } }),
        this.redis.client.del(cooldownKey),
      ]);
      throw error;
    }
  }

  async consume(
    challengeId: string,
    code: string,
    purpose: ChallengePurpose,
  ): Promise<VerificationChallenge & { user: User }> {
    const challenge = await this.prisma.verificationChallenge.findUnique({
      where: { id: challengeId },
      include: { user: true },
    });
    if (!challenge || challenge.purpose !== purpose || challenge.consumedAt) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'El código no es válido.' });
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
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
      await this.prisma.verificationChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: { increment: 1 },
          consumedAt: nextAttempts >= challenge.maxAttempts ? new Date() : undefined,
        },
      });
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'El código no es válido.' });
    }

    const consumed = await this.prisma.verificationChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException({
        code: 'CODE_ALREADY_USED',
        message: 'El código ya fue usado.',
      });
    }
    return challenge;
  }

  private hashCode(code: string): string {
    const pepper = process.env.OTP_PEPPER || 'dear-angel-local-otp-pepper';
    return createHmac('sha256', pepper).update(code).digest('base64url');
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
