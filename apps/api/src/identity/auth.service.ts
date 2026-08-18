import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma, type Sex, type User } from '@prisma/client';

import type { AuthenticatedUser } from '../common/auth.types';
import { requestIp } from '../common/request-meta';
import { TooManyRequestsException } from '../common/too-many-requests.exception';
import { PrismaService } from '../infrastructure/prisma.service';
import type {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterClientDto,
  ResetPasswordDto,
  UpdateOwnProfileDto,
  VerifyCodeDto,
} from './auth.dto';
import { AuditService } from './audit.service';
import { ChallengeService, type ChallengeIssueResult } from './challenge.service';
import { PasswordService } from './password.service';
import { PendingRegistrationService } from './pending-registration.service';
import { PhoneService } from './phone.service';
import { SessionService } from './session.service';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RESETTABLE_STATUSES: User['status'][] = ['ACTIVE', 'INVITED', 'PENDING_VERIFICATION'];

export interface PublicUser {
  id: string;
  role: User['role'];
  status: User['status'];
  fullName: string;
  sex: Sex | null;
  phone: string | null;
  email: string | null;
  mustChangePassword: boolean;
}

export type LoginResult =
  { user: PublicUser } | { verificationRequired: true; verification: ChallengeIssueResult };

@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly phones: PhoneService,
    private readonly challenges: ChallengeService,
    private readonly pendingRegistrations: PendingRegistrationService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {
    this.dummyHash = this.passwords.hash('DearAngelDummyPassword2026');
  }

  async registerClient(
    dto: RegisterClientDto,
    request: Request,
  ): Promise<{ user: PublicUser; verification: ChallengeIssueResult }> {
    this.assertPasswordConfirmation(dto.password, dto.passwordConfirmation);
    const phone = this.phones.normalize(dto.phone);
    const now = new Date();
    await this.pendingRegistrations.discardExpiredForPhone(phone, now);
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException({
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'Este número ya tiene un perfil. Puedes iniciar sesión o recuperar tu acceso.',
      });
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const registrationExpiresAt = this.pendingRegistrations.expirationFrom(now);
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          role: 'CLIENT',
          status: 'PENDING_VERIFICATION',
          fullName: dto.fullName.trim(),
          sex: dto.sex,
          phone,
          passwordHash,
          registrationExpiresAt,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'PHONE_ALREADY_REGISTERED',
          message: 'Este número ya tiene un perfil. Puedes iniciar sesión o recuperar tu acceso.',
        });
      }
      throw error;
    }
    let verification: ChallengeIssueResult;
    try {
      verification = await this.challenges.issue(user, 'VERIFY_PHONE', 'WHATSAPP', phone);
    } catch (error) {
      await this.pendingRegistrations.discardFailedRegistration(user.id, registrationExpiresAt);
      throw error;
    }
    await this.audit.record({
      action: 'CLIENT_SELF_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: requestIp(request),
    });
    return { user: this.publicUser(user), verification };
  }

  async resendVerification(challengeId: string): Promise<ChallengeIssueResult> {
    const previous = await this.prisma.verificationChallenge.findUnique({
      where: { id: challengeId },
      include: { user: true },
    });
    if (
      !previous ||
      previous.purpose !== 'VERIFY_PHONE' ||
      previous.channel !== 'WHATSAPP' ||
      previous.user.archivedAt ||
      previous.user.role !== 'CLIENT' ||
      previous.user.status !== 'PENDING_VERIFICATION' ||
      !previous.user.phone ||
      previous.user.phone !== previous.destination
    ) {
      throw new ForbiddenException({
        code: 'VERIFICATION_NOT_AVAILABLE',
        message: 'Este perfil no requiere verificación o no está disponible.',
      });
    }
    if (await this.pendingRegistrations.discardIfExpired(previous.user)) {
      throw new ForbiddenException({
        code: 'REGISTRATION_EXPIRED',
        message: 'Este registro caducó. Crea tu cuenta nuevamente.',
      });
    }
    return this.challenges.issue(previous.user, 'VERIFY_PHONE', 'WHATSAPP', previous.user.phone);
  }

  async verifyPhone(
    dto: VerifyCodeDto,
    request: Request,
    response: Response,
  ): Promise<{ user: PublicUser }> {
    const challenge = await this.challenges.consume(dto.challengeId, dto.code, 'VERIFY_PHONE');
    if (await this.pendingRegistrations.discardIfExpired(challenge.user)) {
      throw new ForbiddenException({
        code: 'REGISTRATION_EXPIRED',
        message: 'Este registro caducó. Crea tu cuenta nuevamente.',
      });
    }
    if (challenge.user.role !== 'CLIENT' || challenge.channel !== 'WHATSAPP') {
      throw new ForbiddenException({ code: 'INVALID_CODE', message: 'El código no es válido.' });
    }
    if (
      challenge.user.role !== 'CLIENT' ||
      challenge.user.status !== 'PENDING_VERIFICATION' ||
      challenge.user.archivedAt ||
      challenge.channel !== 'WHATSAPP' ||
      challenge.user.phone !== challenge.destination
    ) {
      throw new ForbiddenException({
        code: 'INVALID_CODE',
        message: 'El c\u00f3digo no es v\u00e1lido.',
      });
    }
    const verifiedAt = new Date();
    const activated = await this.prisma.user.updateMany({
      where: {
        id: challenge.userId,
        role: 'CLIENT',
        status: 'PENDING_VERIFICATION',
        archivedAt: null,
        phone: challenge.destination,
        OR: [{ registrationExpiresAt: null }, { registrationExpiresAt: { gt: verifiedAt } }],
      },
      data: { status: 'ACTIVE', phoneVerifiedAt: verifiedAt, registrationExpiresAt: null },
    });
    if (activated.count !== 1) {
      throw new ForbiddenException({
        code: 'INVALID_CODE',
        message: 'El c\u00f3digo no es v\u00e1lido.',
      });
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: challenge.userId },
    });
    await this.sessions.create(user.id, request, response);
    await this.audit.record({
      actorUserId: user.id,
      action: 'PHONE_VERIFIED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: requestIp(request),
    });
    return { user: this.publicUser(user) };
  }

  async login(dto: LoginDto, request: Request, response: Response): Promise<LoginResult> {
    const user = await this.findByIdentifier(dto.identifier);
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const passwordMatches = await this.passwords.verify(dto.password, hash);

    const accountLocked = Boolean(user?.lockedUntil && user.lockedUntil.getTime() > Date.now());
    if (accountLocked && passwordMatches) {
      throw new TooManyRequestsException({
        code: 'ACCOUNT_LOCKED',
        message: 'Demasiados intentos. Intenta nuevamente en unos minutos.',
      });
    }
    if (!user || !user.passwordHash || !passwordMatches) {
      if (user && !accountLocked) await this.recordFailedLogin(user, request);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'El correo, teléfono o contraseña no coincide.',
      });
    }
    if (user.status === 'PENDING_VERIFICATION') {
      if (await this.pendingRegistrations.discardIfExpired(user)) {
        throw new ForbiddenException({
          code: 'REGISTRATION_EXPIRED',
          message: 'Este registro caducó. Crea tu cuenta nuevamente.',
        });
      }
      if (user.role !== 'CLIENT' || !user.phone || user.archivedAt) {
        throw new ForbiddenException({
          code: 'VERIFICATION_NOT_AVAILABLE',
          message: 'Este perfil no puede verificarse.',
        });
      }
      const verification = await this.challenges.resumeOrIssue(
        user,
        'VERIFY_PHONE',
        'WHATSAPP',
        user.phone,
      );
      await this.prisma.user.updateMany({
        where: { id: user.id, status: 'PENDING_VERIFICATION', archivedAt: null },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
      await this.audit.record({
        actorUserId: user.id,
        action: 'PHONE_VERIFICATION_RESUMED',
        entityType: 'User',
        entityId: user.id,
        ipAddress: requestIp(request),
      });
      return { verificationRequired: true, verification };
    }
    this.assertCanLogin(user);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.sessions.create(user.id, request, response);
    await this.audit.record({
      actorUserId: user.id,
      action: 'LOGIN_SUCCEEDED',
      entityType: 'Session',
      ipAddress: requestIp(request),
    });
    return { user: this.publicUser(updated) };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{
    accepted: true;
    recovery?: ChallengeIssueResult;
  }> {
    const user = await this.findByIdentifier(dto.identifier);
    if (!user || user.archivedAt || !RESETTABLE_STATUSES.includes(user.status)) {
      return { accepted: true };
    }
    if (await this.pendingRegistrations.discardIfExpired(user)) {
      return { accepted: true };
    }

    if (user.role === 'CLIENT' && user.phone) {
      return {
        accepted: true,
        recovery: await this.challenges.issue(user, 'RESET_PASSWORD', 'WHATSAPP', user.phone),
      };
    }
    if (user.role !== 'CLIENT' && user.email) {
      return {
        accepted: true,
        recovery: await this.challenges.issue(user, 'RESET_PASSWORD', 'EMAIL', user.email),
      };
    }
    return { accepted: true };
  }

  async resetPassword(dto: ResetPasswordDto, request: Request): Promise<{ reset: true }> {
    this.assertPasswordConfirmation(dto.password, dto.passwordConfirmation);
    const challenge = await this.challenges.consume(dto.challengeId, dto.code, 'RESET_PASSWORD');
    const registrationExpired = await this.pendingRegistrations.discardIfExpired(challenge.user);
    const destinationMatches =
      (challenge.user.role === 'CLIENT' &&
        challenge.channel === 'WHATSAPP' &&
        challenge.user.phone === challenge.destination) ||
      (challenge.user.role !== 'CLIENT' &&
        challenge.channel === 'EMAIL' &&
        challenge.user.email === challenge.destination);
    if (
      challenge.user.archivedAt ||
      registrationExpired ||
      !RESETTABLE_STATUSES.includes(challenge.user.status) ||
      !destinationMatches
    ) {
      throw new ForbiddenException({
        code: 'RESET_NOT_AVAILABLE',
        message: 'Este restablecimiento ya no est\u00e1 disponible.',
      });
    }
    const passwordHash = await this.passwords.hash(dto.password);
    const resetAt = new Date();
    const reset = await this.prisma.user.updateMany({
      where: {
        id: challenge.userId,
        status: challenge.user.status,
        archivedAt: null,
        OR: [{ registrationExpiresAt: null }, { registrationExpiresAt: { gt: resetAt } }],
        ...(challenge.channel === 'WHATSAPP'
          ? { role: 'CLIENT', phone: challenge.destination }
          : { role: { not: 'CLIENT' }, email: challenge.destination }),
      },
      data: {
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        registrationExpiresAt: null,
        ...(challenge.channel === 'WHATSAPP'
          ? { phoneVerifiedAt: challenge.user.phoneVerifiedAt ?? resetAt }
          : { emailVerifiedAt: challenge.user.emailVerifiedAt ?? resetAt }),
      },
    });
    if (reset.count !== 1) {
      throw new ForbiddenException({
        code: 'RESET_NOT_AVAILABLE',
        message: 'Este restablecimiento ya no est\u00e1 disponible.',
      });
    }
    await this.sessions.revokeAll(challenge.userId);
    await this.audit.record({
      actorUserId: challenge.userId,
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: challenge.userId,
      ipAddress: requestIp(request),
    });
    return { reset: true };
  }

  async changePassword(
    currentUser: AuthenticatedUser,
    sessionId: string,
    dto: ChangePasswordDto,
    request: Request,
  ): Promise<{ changed: true }> {
    this.assertPasswordConfirmation(dto.newPassword, dto.passwordConfirmation);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: currentUser.id } });
    if (
      !user.passwordHash ||
      !(await this.passwords.verify(dto.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'La contraseña actual no coincide.',
      });
    }
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });
    await this.sessions.revokeAll(user.id, sessionId);
    await this.audit.record({
      actorUserId: user.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: requestIp(request),
    });
    return { changed: true };
  }

  async logout(sessionId: string, response: Response): Promise<{ loggedOut: true }> {
    await this.sessions.revoke(sessionId);
    this.sessions.clearCookie(response);
    return { loggedOut: true };
  }

  async logoutAll(userId: string, response: Response): Promise<{ loggedOut: true }> {
    await this.sessions.revokeAll(userId);
    this.sessions.clearCookie(response);
    return { loggedOut: true };
  }

  async me(userId: string): Promise<{ user: PublicUser }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { user: this.publicUser(user) };
  }

  async updateProfile(
    currentUser: AuthenticatedUser,
    dto: UpdateOwnProfileDto,
    request: Request,
  ): Promise<{ user: PublicUser; verification?: ChallengeIssueResult }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: currentUser.id } });
    if (
      !user.passwordHash ||
      !(await this.passwords.verify(dto.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'La contraseña actual no coincide.',
      });
    }

    const fullName = dto.fullName.trim();
    const phone = dto.phone ? this.phones.normalize(dto.phone) : null;
    const email = dto.email?.trim().toLowerCase() || null;

    if (user.role === 'CLIENT' && (!phone || !dto.sex)) {
      throw new ConflictException({
        code: 'CLIENT_PROFILE_INCOMPLETE',
        message: 'Nombre, sexo y WhatsApp son necesarios para tu perfil.',
      });
    }
    if (user.role !== 'CLIENT' && !email) {
      throw new ConflictException({
        code: 'STAFF_EMAIL_REQUIRED',
        message: 'El correo es necesario para el acceso y la recuperación del personal.',
      });
    }

    const phoneChanged = phone !== user.phone;
    const emailChanged = email !== user.email;
    if (phoneChanged && phone) {
      const owner = await this.prisma.user.findUnique({ where: { phone } });
      if (owner && owner.id !== user.id) {
        throw new ConflictException({
          code: 'PHONE_ALREADY_REGISTERED',
          message: 'Este número ya pertenece a otro perfil.',
        });
      }
    }
    if (emailChanged && email) {
      const owner = await this.prisma.user.findUnique({ where: { email } });
      if (owner && owner.id !== user.id) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'Este correo ya pertenece a otro perfil.',
        });
      }
    }

    let verification: ChallengeIssueResult | undefined;
    if (user.role === 'CLIENT' && phoneChanged && phone) {
      verification = await this.challenges.issue(user, 'VERIFY_PHONE', 'WHATSAPP', phone);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        fullName,
        sex: user.role === 'ADMIN' ? 'FEMALE' : (dto.sex ?? user.sex),
        phone: user.role === 'CLIENT' ? phone : phone || null,
        email: user.role === 'CLIENT' ? null : email,
        ...(user.role === 'CLIENT' && phoneChanged
          ? {
              phoneVerifiedAt: null,
              status: 'PENDING_VERIFICATION',
              registrationExpiresAt: null,
            }
          : {}),
        ...(user.role !== 'CLIENT' && emailChanged ? { emailVerifiedAt: new Date() } : {}),
      },
    });

    if (user.role === 'CLIENT' && phoneChanged) {
      await this.sessions.revokeAll(user.id);
    }
    await this.audit.record({
      actorUserId: user.id,
      action: 'OWN_PROFILE_UPDATED',
      entityType: 'User',
      entityId: user.id,
      metadata: { phoneChanged, emailChanged },
      ipAddress: requestIp(request),
    });
    return { user: this.publicUser(updated), verification };
  }

  private async findByIdentifier(identifier: string): Promise<User | null> {
    const value = identifier.trim();
    if (value.includes('@')) {
      return this.prisma.user.findUnique({ where: { email: value.toLowerCase() } });
    }
    try {
      return this.prisma.user.findUnique({ where: { phone: this.phones.normalize(value) } });
    } catch {
      return null;
    }
  }

  private async recordFailedLogin(user: User, request: Request): Promise<void> {
    const failed = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    const locked = failed.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS;
    if (locked && (!failed.lockedUntil || failed.lockedUntil.getTime() <= Date.now())) {
      const now = new Date();
      await this.prisma.user.updateMany({
        where: {
          id: user.id,
          failedLoginAttempts: { gte: MAX_LOGIN_ATTEMPTS },
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
        },
        data: { lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60 * 1000) },
      });
    }
    await this.audit.record({
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      metadata: { attempts: failed.failedLoginAttempts, locked },
      ipAddress: requestIp(request),
    });
  }

  private assertCanLogin(user: User): void {
    if (user.status === 'PENDING_VERIFICATION') {
      throw new ForbiddenException({
        code: 'PHONE_NOT_VERIFIED',
        message: 'Primero verifica tu número de WhatsApp.',
      });
    }
    if (user.status === 'INVITED') {
      throw new ForbiddenException({
        code: 'ACCOUNT_NOT_ACTIVATED',
        message: 'Activa tu perfil desde “Olvidé mi contraseña”.',
      });
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Esta cuenta está pausada o archivada. Contacta a Dear Angel.',
      });
    }
  }

  private assertPasswordConfirmation(password: string, confirmation: string): void {
    if (password !== confirmation) {
      throw new ConflictException({
        code: 'PASSWORD_MISMATCH',
        message: 'Las contraseñas no coinciden.',
      });
    }
  }

  private publicUser(user: User): PublicUser {
    return {
      id: user.id,
      role: user.role,
      status: user.status,
      fullName: user.fullName,
      sex: user.sex,
      phone: user.phone,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
