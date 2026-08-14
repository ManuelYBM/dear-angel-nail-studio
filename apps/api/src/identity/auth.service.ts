import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Sex, User } from '@prisma/client';

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
import { PhoneService } from './phone.service';
import { SessionService } from './session.service';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

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

@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly phones: PhoneService,
    private readonly challenges: ChallengeService,
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
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException({
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'Este número ya tiene un perfil. Puedes iniciar sesión o recuperar tu acceso.',
      });
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        role: 'CLIENT',
        status: 'PENDING_VERIFICATION',
        fullName: dto.fullName.trim(),
        sex: dto.sex,
        phone,
        passwordHash,
      },
    });
    await this.audit.record({
      action: 'CLIENT_SELF_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: requestIp(request),
    });
    const verification = await this.challenges.issue(user, 'VERIFY_PHONE', 'WHATSAPP', phone);
    return { user: this.publicUser(user), verification };
  }

  async resendVerification(phoneInput: string): Promise<ChallengeIssueResult> {
    const phone = this.phones.normalize(phoneInput);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || user.role !== 'CLIENT' || user.status !== 'PENDING_VERIFICATION') {
      throw new ForbiddenException({
        code: 'VERIFICATION_NOT_AVAILABLE',
        message: 'Este perfil no requiere verificación o no está disponible.',
      });
    }
    return this.challenges.issue(user, 'VERIFY_PHONE', 'WHATSAPP', phone);
  }

  async verifyPhone(
    dto: VerifyCodeDto,
    request: Request,
    response: Response,
  ): Promise<{ user: PublicUser }> {
    const challenge = await this.challenges.consume(dto.challengeId, dto.code, 'VERIFY_PHONE');
    if (challenge.user.role !== 'CLIENT' || challenge.channel !== 'WHATSAPP') {
      throw new ForbiddenException({ code: 'INVALID_CODE', message: 'El código no es válido.' });
    }
    const user = await this.prisma.user.update({
      where: { id: challenge.userId },
      data: { status: 'ACTIVE', phoneVerifiedAt: new Date() },
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

  async login(dto: LoginDto, request: Request, response: Response): Promise<{ user: PublicUser }> {
    const user = await this.findByIdentifier(dto.identifier);
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const passwordMatches = await this.passwords.verify(dto.password, hash);

    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new TooManyRequestsException({
        code: 'ACCOUNT_LOCKED',
        message: 'Demasiados intentos. Intenta nuevamente en unos minutos.',
      });
    }
    if (!user || !user.passwordHash || !passwordMatches) {
      if (user) await this.recordFailedLogin(user, request);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'El correo, teléfono o contraseña no coincide.',
      });
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
    if (!user || user.status === 'ARCHIVED') return { accepted: true };

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
    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.user.update({
      where: { id: challenge.userId },
      data: {
        passwordHash,
        status: 'ACTIVE',
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(challenge.channel === 'WHATSAPP'
          ? { phoneVerifiedAt: challenge.user.phoneVerifiedAt ?? new Date() }
          : { emailVerifiedAt: challenge.user.emailVerifiedAt ?? new Date() }),
      },
    });
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
          ? { phoneVerifiedAt: null, status: 'PENDING_VERIFICATION' }
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
    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil =
      attempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
    await this.audit.record({
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      metadata: { attempts, locked: Boolean(lockedUntil) },
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
