import type { User } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';

function user(status: User['status'] = 'ACTIVE'): User {
  return {
    id: 'user-id',
    role: 'CLIENT',
    status,
    fullName: 'Cliente',
    sex: null,
    phone: '+529991234567',
    email: null,
    passwordHash: 'stored-hash',
    phoneVerifiedAt: status === 'PENDING_VERIFICATION' ? null : new Date(),
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

function request() {
  return { headers: {}, ip: '127.0.0.1', socket: {} } as never;
}

function challenge(challengeUser: User) {
  return {
    id: 'challenge-id',
    userId: challengeUser.id,
    purpose: 'RESET_PASSWORD',
    channel: 'WHATSAPP',
    destination: challengeUser.phone,
    codeHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: new Date(),
    attempts: 0,
    maxAttempts: 5,
    createdAt: new Date(),
    user: challengeUser,
  };
}

function createService(prisma: object, consumed: object, passwordMatches = true) {
  const passwords = {
    hash: vi.fn().mockResolvedValue('new-hash'),
    verify: vi.fn().mockResolvedValue(passwordMatches),
  };
  const challenges = {
    consume: vi.fn().mockResolvedValue(consumed),
    issue: vi.fn(),
    resumeOrIssue: vi.fn(),
  };
  const pendingRegistrations = {
    expirationFrom: vi.fn((now: Date) => new Date(now.getTime() + 24 * 60 * 60_000)),
    discardExpiredForPhone: vi.fn().mockResolvedValue(0),
    discardIfExpired: vi.fn().mockResolvedValue(false),
    discardFailedRegistration: vi.fn(),
  };
  const sessions = {
    create: vi.fn(),
    revokeAll: vi.fn(),
    revoke: vi.fn(),
    clearCookie: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const service = new AuthService(
    prisma as never,
    passwords as never,
    { normalize: vi.fn((value: string) => value) } as never,
    challenges as never,
    pendingRegistrations as never,
    sessions as never,
    audit as never,
  );
  return { service, passwords, challenges, pendingRegistrations, sessions, audit };
}

describe('AuthService invariantes de identidad', () => {
  it('descarta el autorregistro si falla el primer envío de verificación', async () => {
    const pending = user('PENDING_VERIFICATION');
    const prisma = {
      user: {
        deleteMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(pending),
      },
    };
    const { service, challenges, pendingRegistrations, audit } = createService(prisma, {});
    challenges.issue.mockRejectedValueOnce(new Error('delivery failed'));

    await expect(
      service.registerClient(
        {
          fullName: 'Cliente',
          sex: 'FEMALE',
          phone: '+529991234567',
          password: 'Clave2026',
          passwordConfirmation: 'Clave2026',
          acceptedMinorNotice: true,
        },
        request(),
      ),
    ).rejects.toThrow('delivery failed');

    expect(pendingRegistrations.discardFailedRegistration).toHaveBeenCalledWith(
      pending.id,
      expect.any(Date),
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('retoma la verificación con credenciales válidas sin crear una sesión', async () => {
    const pending = {
      ...user('PENDING_VERIFICATION'),
      registrationExpiresAt: new Date(Date.now() + 60_000),
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(pending),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { service, challenges, sessions, audit } = createService(prisma, {});
    const verification = {
      challengeId: 'challenge-id',
      expiresInSeconds: 600,
      destination: '+52•••4567',
      provider: 'whatsapp',
    };
    challenges.resumeOrIssue.mockResolvedValueOnce(verification);

    await expect(
      service.login({ identifier: '+529991234567', password: 'Clave2026' }, request(), {} as never),
    ).resolves.toEqual({ verificationRequired: true, verification });

    expect(sessions.create).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: pending.id, status: 'PENDING_VERIFICATION', archivedAt: null },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PHONE_VERIFICATION_RESUMED' }),
    );
  });

  it('no emite verificación si la contraseña no coincide', async () => {
    const pending = user('PENDING_VERIFICATION');
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(pending),
        update: vi.fn().mockResolvedValue({ ...pending, failedLoginAttempts: 1 }),
      },
    };
    const { service, challenges } = createService(prisma, {}, false);

    await expect(
      service.login(
        { identifier: '+529991234567', password: 'incorrecta' },
        request(),
        {} as never,
      ),
    ).rejects.toThrow();

    expect(challenges.resumeOrIssue).not.toHaveBeenCalled();
  });

  it('elimina un autorregistro vencido al intentar retomarlo con su contraseña', async () => {
    const pending = {
      ...user('PENDING_VERIFICATION'),
      registrationExpiresAt: new Date(Date.now() - 60_000),
    };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(pending) } };
    const { service, challenges, pendingRegistrations } = createService(prisma, {});
    pendingRegistrations.discardIfExpired.mockResolvedValueOnce(true);

    await expect(
      service.login({ identifier: '+529991234567', password: 'Clave2026' }, request(), {} as never),
    ).rejects.toThrow();

    expect(challenges.resumeOrIssue).not.toHaveBeenCalled();
  });

  it('informa que el autorregistro venció al intentar confirmar su código', async () => {
    const pending = {
      ...user('PENDING_VERIFICATION'),
      registrationExpiresAt: new Date(Date.now() - 60_000),
    };
    const verification = {
      ...challenge(pending),
      purpose: 'VERIFY_PHONE',
      consumedAt: new Date(),
    };
    const prisma = { user: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() } };
    const { service, pendingRegistrations, sessions } = createService(prisma, verification);
    pendingRegistrations.discardIfExpired.mockResolvedValueOnce(true);

    await expect(
      service.verifyPhone({ challengeId: 'challenge-id', code: '123456' }, request(), {} as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REGISTRATION_EXPIRED' }) as unknown,
    });

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('no restablece ni reactiva una cuenta pausada', async () => {
    const pausedChallenge = challenge(user('PAUSED'));
    const prisma = { user: { updateMany: vi.fn() } };
    const { service, sessions } = createService(prisma, pausedChallenge);

    await expect(
      service.resetPassword(
        {
          challengeId: 'challenge-id',
          code: '123456',
          password: 'NuevaClave2026',
          passwordConfirmation: 'NuevaClave2026',
        },
        request(),
      ),
    ).rejects.toThrow();

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(sessions.revokeAll).not.toHaveBeenCalled();
  });

  it('usa una actualización condicional para que una pausa concurrente gane al OTP', async () => {
    const pending = user('PENDING_VERIFICATION');
    const verification = {
      ...challenge(pending),
      purpose: 'VERIFY_PHONE',
      consumedAt: new Date(),
    };
    const prisma = {
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn(),
      },
    };
    const { service, sessions } = createService(prisma, verification);

    await expect(
      service.verifyPhone({ challengeId: 'challenge-id', code: '123456' }, request(), {} as never),
    ).rejects.toThrow();

    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING_VERIFICATION',
          archivedAt: null,
          phone: '+529991234567',
        }) as unknown,
      }),
    );
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('incrementa los intentos de login atómicamente', async () => {
    const account = { ...user(), failedLoginAttempts: 4 };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(account),
        update: vi.fn().mockResolvedValue({ ...account, failedLoginAttempts: 5 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { service } = createService(prisma, {}, false);

    await expect(
      service.login(
        { identifier: '+529991234567', password: 'incorrecta' },
        request(),
        {} as never,
      ),
    ).rejects.toThrow();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ failedLoginAttempts: { gte: 5 } }) as unknown,
      }),
    );
  });
});
