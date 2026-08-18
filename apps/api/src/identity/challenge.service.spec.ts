import type { User } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChallengeService } from './challenge.service';

const original = { ...process.env };

function user(status: User['status'] = 'ACTIVE'): User {
  return {
    id: 'user-id',
    role: 'CLIENT',
    status,
    fullName: 'Cliente',
    sex: null,
    phone: '+529991234567',
    email: null,
    passwordHash: 'hash',
    phoneVerifiedAt: new Date(),
    emailVerifiedAt: null,
    registrationExpiresAt: null,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ChallengeService', () => {
  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
  });

  it('serializa cada intento fallido con compare-and-set', async () => {
    process.env.OTP_PEPPER = 'test-pepper';
    const base = {
      id: 'challenge-id',
      userId: 'user-id',
      purpose: 'RESET_PASSWORD',
      channel: 'WHATSAPP',
      destination: '+529991234567',
      codeHash: createHmac('sha256', 'test-pepper').update('654321').digest('base64url'),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      maxAttempts: 5,
      createdAt: new Date(),
      user: user(),
    };
    const prisma = {
      verificationChallenge: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ ...base, attempts: 0 })
          .mockResolvedValueOnce({ ...base, attempts: 1 }),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
      },
    };
    const service = new ChallengeService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.consume('challenge-id', '000000', 'RESET_PASSWORD')).rejects.toThrow();
    expect(prisma.verificationChallenge.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.verificationChallenge.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ attempts: 1, consumedAt: null }) as unknown,
        data: expect.objectContaining({ attempts: { increment: 1 } }) as unknown,
      }),
    );
  });

  it('suprime debugCode fuera del desarrollo seguro aunque el proveedor lo devuelva', async () => {
    process.env.NODE_ENV = 'production';
    process.env.OTP_MOCK_DEBUG_ENABLED = 'true';
    const prisma = {
      verificationChallenge: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'challenge-id' }),
        delete: vi.fn(),
      },
    };
    const redis = {
      client: {
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn(),
      },
    };
    const messaging = {
      sendCode: vi.fn().mockResolvedValue({ provider: 'mock', debugCode: '123456' }),
    };
    const phones = { mask: vi.fn().mockReturnValue('+52••••4567') };
    const service = new ChallengeService(
      prisma as never,
      redis as never,
      messaging as never,
      phones as never,
    );

    const result = await service.issue(user(), 'VERIFY_PHONE', 'WHATSAPP', '+529991234567');

    expect(result).not.toHaveProperty('debugCode');
  });

  it('retoma el challenge vigente cuando el reenvío sigue en cooldown', async () => {
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const prisma = {
      verificationChallenge: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'existing-challenge',
          expiresAt,
          createdAt: new Date(),
        }),
      },
    };
    const redis = { client: { set: vi.fn().mockResolvedValue(null) } };
    const phones = { mask: vi.fn().mockReturnValue('+52•••4567') };
    const service = new ChallengeService(
      prisma as never,
      redis as never,
      {} as never,
      phones as never,
    );

    const result = await service.resumeOrIssue(
      user('PENDING_VERIFICATION'),
      'VERIFY_PHONE',
      'WHATSAPP',
      '+529991234567',
    );

    expect(result).toEqual(
      expect.objectContaining({
        challengeId: 'existing-challenge',
        destination: '+52•••4567',
        provider: 'pending',
      }),
    );
    expect(result.expiresInSeconds).toBeGreaterThan(0);
  });

  it('no promete un código más allá del vencimiento del autorregistro', async () => {
    process.env.OTP_PEPPER = 'test-pepper';
    const registrationExpiresAt = new Date(Date.now() + 90_000);
    const prisma = {
      verificationChallenge: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'challenge-id' }),
        delete: vi.fn(),
      },
    };
    const redis = {
      client: { set: vi.fn().mockResolvedValue('OK'), del: vi.fn() },
    };
    const messaging = { sendCode: vi.fn().mockResolvedValue({ provider: 'whatsapp' }) };
    const phones = { mask: vi.fn().mockReturnValue('+52•••4567') };
    const service = new ChallengeService(
      prisma as never,
      redis as never,
      messaging as never,
      phones as never,
    );

    const result = await service.issue(
      { ...user('PENDING_VERIFICATION'), registrationExpiresAt },
      'VERIFY_PHONE',
      'WHATSAPP',
      '+529991234567',
    );

    const created = prisma.verificationChallenge.create.mock.calls[0]?.[0] as {
      data: { expiresAt: Date };
    };
    expect(created.data.expiresAt.getTime()).toBeLessThanOrEqual(registrationExpiresAt.getTime());
    expect(result.expiresInSeconds).toBeGreaterThan(0);
    expect(result.expiresInSeconds).toBeLessThanOrEqual(90);
  });
});
