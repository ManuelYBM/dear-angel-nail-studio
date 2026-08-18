import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User, UserStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { requestIp } from '../common/request-meta';
import type { AuthenticatedUser } from '../common/auth.types';
import { PrismaService } from '../infrastructure/prisma.service';
import type { Request } from 'express';
import type { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './admin-users.dto';
import { AuditService } from './audit.service';
import { ChallengeService, type ChallengeIssueResult } from './challenge.service';
import { PasswordService } from './password.service';
import { PhoneService } from './phone.service';
import { SessionService } from './session.service';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly phones: PhoneService,
    private readonly sessions: SessionService,
    private readonly challenges: ChallengeService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      registrationExpiresAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { email: { contains: query.search.toLowerCase(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((user) => this.safeUser(user)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async get(userId: string) {
    const user = await this.find(userId);
    return { user: this.safeUser(user) };
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateUserDto,
    request: Request,
  ): Promise<{ user: ReturnType<AdminUsersService['safeUser']>; temporaryPassword?: string }> {
    const phone = dto.phone ? this.phones.normalize(dto.phone) : undefined;
    const email = dto.email?.trim().toLowerCase();
    if (dto.role === 'CLIENT' && !phone) {
      throw new BadRequestException({
        code: 'CLIENT_PHONE_REQUIRED',
        message: 'Un perfil de cliente necesita número de WhatsApp.',
      });
    }
    if (dto.role === 'NAIL_TECHNICIAN' && !email) {
      throw new BadRequestException({
        code: 'STAFF_EMAIL_REQUIRED',
        message: 'Una manicurista necesita correo para recuperar su acceso.',
      });
    }
    await this.assertAvailable(phone, email);

    const generatedPassword =
      dto.role === 'NAIL_TECHNICIAN' && !dto.temporaryPassword
        ? `Da-${randomBytes(8).toString('base64url')}7`
        : undefined;
    const temporaryPassword = dto.temporaryPassword ?? generatedPassword;
    const passwordHash = temporaryPassword
      ? await this.passwords.hash(temporaryPassword)
      : undefined;
    const user = await this.prisma.user.create({
      data: {
        role: dto.role,
        status:
          dto.role === 'NAIL_TECHNICIAN'
            ? 'ACTIVE'
            : passwordHash
              ? 'PENDING_VERIFICATION'
              : 'INVITED',
        fullName: dto.fullName.trim(),
        sex: dto.sex,
        phone,
        email,
        passwordHash,
        emailVerifiedAt: dto.role === 'NAIL_TECHNICIAN' ? new Date() : undefined,
        mustChangePassword: Boolean(passwordHash),
        technicianSchedule: dto.role === 'NAIL_TECHNICIAN' ? { create: {} } : undefined,
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'USER_CREATED_BY_ADMIN',
      entityType: 'User',
      entityId: user.id,
      metadata: { role: user.role, status: user.status },
      ipAddress: requestIp(request),
    });
    return {
      user: this.safeUser(user),
      ...(temporaryPassword ? { temporaryPassword } : {}),
    };
  }

  async update(actor: AuthenticatedUser, userId: string, dto: UpdateUserDto, request: Request) {
    const user = await this.findEditable(userId);
    const phone =
      dto.phone === null ? null : dto.phone ? this.phones.normalize(dto.phone) : undefined;
    const email = dto.email === null ? null : dto.email?.trim().toLowerCase();
    await this.assertAvailable(phone ?? undefined, email ?? undefined, user.id);
    if (user.role === 'CLIENT' && phone === null) {
      throw new BadRequestException({
        code: 'CLIENT_PHONE_REQUIRED',
        message: 'Un perfil de cliente necesita número de WhatsApp.',
      });
    }
    if (user.role === 'NAIL_TECHNICIAN' && email === null) {
      throw new BadRequestException({
        code: 'STAFF_EMAIL_REQUIRED',
        message: 'Una manicurista necesita correo.',
      });
    }

    const clientPhoneChanged =
      user.role === 'CLIENT' && phone !== undefined && phone !== user.phone;
    const staffEmailChanged = user.role !== 'CLIENT' && email !== undefined && email !== user.email;
    const updateUser = this.prisma.user.update({
      where: { id: user.id },
      data: {
        fullName: dto.fullName?.trim(),
        sex: dto.sex,
        phone,
        email,
        ...(clientPhoneChanged
          ? {
              phoneVerifiedAt: null,
              status: 'PENDING_VERIFICATION',
              registrationExpiresAt: null,
            }
          : user.role === 'NAIL_TECHNICIAN' && email !== undefined
            ? { emailVerifiedAt: new Date() }
            : {}),
      },
    });
    const updated =
      clientPhoneChanged || staffEmailChanged
        ? (
            await this.prisma.$transaction([
              updateUser,
              this.prisma.verificationChallenge.updateMany({
                where: { userId: user.id, consumedAt: null },
                data: { consumedAt: new Date() },
              }),
            ])
          )[0]
        : await updateUser;
    if (clientPhoneChanged) await this.sessions.revokeAll(user.id);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'USER_PROFILE_UPDATED_BY_ADMIN',
      entityType: 'User',
      entityId: user.id,
      metadata: { changedFields: Object.keys(dto) },
      ipAddress: requestIp(request),
    });
    return { user: this.safeUser(updated) };
  }

  async updateStatus(
    actor: AuthenticatedUser,
    userId: string,
    status: UserStatus,
    request: Request,
  ) {
    const user = await this.findEditable(userId);
    if (status === 'ACTIVE' && user.role === 'CLIENT' && !user.phoneVerifiedAt) {
      throw new ConflictException({
        code: 'PHONE_VERIFICATION_REQUIRED',
        message: 'El perfil debe verificar su WhatsApp antes de activar la cuenta.',
      });
    }
    const updateUser = this.prisma.user.update({
      where: { id: user.id },
      data: {
        status,
        archivedAt: status === 'ARCHIVED' ? new Date() : null,
        registrationExpiresAt: status === 'PENDING_VERIFICATION' ? undefined : null,
      },
    });
    const updated =
      status === 'PAUSED' || status === 'ARCHIVED'
        ? (
            await this.prisma.$transaction([
              updateUser,
              this.prisma.verificationChallenge.updateMany({
                where: { userId: user.id, consumedAt: null },
                data: { consumedAt: new Date() },
              }),
            ])
          )[0]
        : await updateUser;
    if (status !== 'ACTIVE') await this.sessions.revokeAll(user.id);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'USER_STATUS_CHANGED',
      entityType: 'User',
      entityId: user.id,
      metadata: { previousStatus: user.status, status },
      ipAddress: requestIp(request),
    });
    return { user: this.safeUser(updated) };
  }

  async sendPasswordReset(
    actor: AuthenticatedUser,
    userId: string,
    request: Request,
  ): Promise<{ recovery: ChallengeIssueResult }> {
    const user = await this.findEditable(userId);
    if (user.archivedAt || user.status === 'PAUSED' || user.status === 'ARCHIVED') {
      throw new ConflictException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'No se puede enviar recuperaci\u00f3n a una cuenta pausada o archivada.',
      });
    }
    const channel = user.role === 'CLIENT' ? 'WHATSAPP' : 'EMAIL';
    const destination = user.role === 'CLIENT' ? user.phone : user.email;
    if (!destination) {
      throw new BadRequestException({
        code: 'RECOVERY_DESTINATION_MISSING',
        message: 'El perfil no tiene un medio de recuperación configurado.',
      });
    }
    const recovery = await this.challenges.issue(user, 'RESET_PASSWORD', channel, destination);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'PASSWORD_RESET_SENT_BY_ADMIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: requestIp(request),
    });
    return { recovery };
  }

  private async find(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'No encontramos este perfil.',
      });
    }
    return user;
  }

  private async findEditable(userId: string): Promise<User> {
    const user = await this.find(userId);
    if (user.role === 'ADMIN') {
      throw new ConflictException({
        code: 'ADMIN_PROTECTED',
        message: 'La cuenta administradora se gestiona desde su perfil personal.',
      });
    }
    return user;
  }

  private async assertAvailable(phone?: string, email?: string, exceptId?: string): Promise<void> {
    if (!phone && !email) return;
    const duplicate = await this.prisma.user.findFirst({
      where: {
        ...(exceptId ? { id: { not: exceptId } } : {}),
        OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
      },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'IDENTIFIER_ALREADY_REGISTERED',
        message: 'El teléfono o correo ya pertenece a otro perfil.',
      });
    }
  }

  private safeUser(user: User) {
    return {
      id: user.id,
      role: user.role,
      status: user.status,
      fullName: user.fullName,
      sex: user.sex,
      phone: user.phone,
      email: user.email,
      phoneVerifiedAt: user.phoneVerifiedAt,
      emailVerifiedAt: user.emailVerifiedAt,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      archivedAt: user.archivedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
