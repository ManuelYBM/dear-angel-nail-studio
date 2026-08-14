import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addYears } from 'date-fns';
import type { Request } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import type { AuthenticatedUser } from '../common/auth.types';
import { requestIp } from '../common/request-meta';
import { PrismaService } from '../infrastructure/prisma.service';
import { StorageService } from '../infrastructure/storage.service';
import { AuditService } from '../identity/audit.service';
import { CalendarService } from '../notifications/calendar.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  DepositListQueryDto,
  PaymentSettingsDto,
  ReceiptAcceptanceDto,
  ReviewDepositDto,
} from './payments.dto';
import { canReviewDeposit, canUploadReceipt, confirmationCode } from './payment.rules';

export interface UploadedReceipt {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface PrivateReceipt {
  stream: Readable;
  mimeType: string;
  filename: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly calendars: CalendarService,
  ) {}

  async createForAppointment(
    tx: Prisma.TransactionClient,
    appointmentId: string,
    createdAt = new Date(),
  ) {
    const settings = await tx.paymentSettings.findUniqueOrThrow({ where: { id: 'default' } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reference = this.reference(createdAt);
      try {
        return await tx.depositPayment.create({
          data: {
            appointmentId,
            reference,
            amountCents: settings.amountCents,
            recipientNameSnapshot: settings.recipientName,
            bankNameSnapshot: settings.bankName,
            clabeSnapshot: settings.clabe,
            accountNumberSnapshot: settings.accountNumber,
            transferNotesSnapshot: settings.transferNotes,
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
      }
    }
    throw new ConflictException('No pudimos generar la referencia. Intenta nuevamente.');
  }

  async publicSettings() {
    const settings = await this.settings();
    return {
      amountCents: settings.amountCents,
      recipientName: settings.recipientName,
      bankName: settings.bankName,
      clabe: settings.clabe,
      accountNumber: settings.accountNumber,
      transferNotes: settings.transferNotes,
      policyVersion: settings.policyVersion,
      policyText: settings.policyText,
    };
  }

  async configuration() {
    return { settings: await this.settings() };
  }

  async updateConfiguration(actor: AuthenticatedUser, dto: PaymentSettingsDto, request: Request) {
    const current = await this.settings();
    if (dto.policyText !== current.policyText && dto.policyVersion === current.policyVersion) {
      throw new BadRequestException(
        'Cambia también la versión cuando modifiques el contenido de las políticas.',
      );
    }
    const settings = await this.prisma.paymentSettings.update({
      where: { id: 'default' },
      data: {
        ...dto,
        accountNumber: dto.accountNumber || null,
      },
    });
    await this.record(actor, request, 'PAYMENT_SETTINGS_UPDATED', 'PaymentSettings', settings.id, {
      amountCents: settings.amountCents,
      bankName: settings.bankName,
      policyVersion: settings.policyVersion,
    });
    return { settings };
  }

  async deposit(actor: AuthenticatedUser, appointmentId: string) {
    await this.expireAwaitingReceipts();
    const payment = await this.findAuthorized(actor, appointmentId);
    return { deposit: this.safeDeposit(payment, actor.role === 'ADMIN') };
  }

  async list(actor: AuthenticatedUser, query: DepositListQueryDto) {
    await this.expireAwaitingReceipts();
    const deposits = await this.prisma.depositPayment.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(actor.role === 'CLIENT' ? { appointment: { clientId: actor.id } } : {}),
        ...(actor.role === 'NAIL_TECHNICIAN' ? { appointment: { technicianId: actor.id } } : {}),
      },
      include: this.depositInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return { items: deposits.map((deposit) => this.safeDeposit(deposit, actor.role === 'ADMIN')) };
  }

  async uploadReceipt(
    actor: AuthenticatedUser,
    appointmentId: string,
    dto: ReceiptAcceptanceDto,
    file: UploadedReceipt | undefined,
    request: Request,
  ) {
    const receipt = this.assertReceipt(file);
    const current = await this.findAuthorized(actor, appointmentId);
    if (actor.role !== 'CLIENT' || current.appointment.clientId !== actor.id) {
      throw new ForbiddenException(
        'Solo el perfil de cliente de la cita puede subir el comprobante.',
      );
    }
    if (!dto.policiesAccepted) {
      throw new BadRequestException('Debes aceptar las políticas antes de enviar el comprobante.');
    }
    const settings = await this.settings();
    if (dto.policyVersion !== settings.policyVersion) {
      throw new ConflictException({
        code: 'POLICY_VERSION_CHANGED',
        message: 'Las políticas fueron actualizadas. Revísalas y vuelve a aceptar.',
      });
    }
    if (!canUploadReceipt(current.appointment.status, current.appointment.holdExpiresAt)) {
      await this.expireAwaitingReceipts();
      throw new ConflictException({
        code: 'RECEIPT_DEADLINE_EXPIRED',
        message: 'Terminó el plazo para subir el comprobante y el horario fue liberado.',
      });
    }

    const objectKey = `deposits/${current.id}/${randomUUID()}-${this.safeFilename(receipt.originalname)}`;
    await this.storage.putObject(objectKey, receipt.buffer, receipt.mimetype, {
      'X-Amz-Meta-Retention-Until': addYears(new Date(), 1).toISOString(),
    });
    const now = new Date();
    const retentionUntil = addYears(now, 1);
    try {
      const deposit = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.appointment.updateMany({
          where: { id: appointmentId, status: 'HELD', holdExpiresAt: { gt: now } },
          data: { status: 'PENDING_PAYMENT', holdExpiresAt: null },
        });
        if (changed.count !== 1) {
          throw new ConflictException(
            'El apartado ya no está disponible para recibir comprobantes.',
          );
        }
        await tx.depositPayment.update({
          where: { id: current.id },
          data: {
            status: 'PENDING_REVIEW',
            objectKey,
            mimeType: receipt.mimetype,
            filename: receipt.originalname,
            sizeBytes: receipt.size,
            receiptUploadedAt: now,
            retentionUntil,
            acceptedPolicyVersion: settings.policyVersion,
            acceptedPoliciesAt: now,
          },
        });
        return tx.depositPayment.findUniqueOrThrow({
          where: { id: current.id },
          include: this.depositInclude,
        });
      });
      await this.record(actor, request, 'DEPOSIT_RECEIPT_UPLOADED', 'DepositPayment', deposit.id, {
        appointmentId,
        policyVersion: settings.policyVersion,
      });
      const administrators = await this.prisma.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });
      await this.notifications.notifyMany(
        administrators.map(({ id }) => id),
        {
          kind: 'PAYMENT',
          title: 'Nuevo anticipo por revisar',
          body: `${deposit.appointment.client?.fullName ?? 'Una clienta o cliente'} subió su comprobante.`,
          actionUrl: '/administracion/anticipos',
          templateKey: 'payment_update',
          dedupePrefix: `deposit-uploaded:${deposit.id}`,
          external: true,
        },
      );
      return { deposit: this.safeDeposit(deposit, false) };
    } catch (error) {
      await this.storage.removeObject(objectKey).catch(() => undefined);
      throw error;
    }
  }

  async review(
    actor: AuthenticatedUser,
    depositId: string,
    dto: ReviewDepositDto,
    request: Request,
  ) {
    const current = await this.prisma.depositPayment.findUnique({
      where: { id: depositId },
      include: this.depositInclude,
    });
    if (!current) throw new NotFoundException('No encontramos ese anticipo.');
    if (!canReviewDeposit(current.status, current.appointment.status)) {
      throw new ConflictException('Este anticipo ya no está pendiente de revisión.');
    }
    if (dto.decision === 'REJECTED' && !dto.notes?.trim()) {
      throw new BadRequestException('Escribe el motivo del rechazo para informar al cliente.');
    }
    const now = new Date();
    const deposit = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.depositPayment.updateMany({
        where: { id: depositId, status: 'PENDING_REVIEW' },
        data: {
          status: dto.decision,
          reviewedByUserId: actor.id,
          reviewedAt: now,
          reviewNotes: dto.notes?.trim() || null,
          confirmationCode:
            dto.decision === 'APPROVED' ? confirmationCode(current.reference) : null,
        },
      });
      if (changed.count !== 1) throw new ConflictException('El anticipo acaba de ser revisado.');
      await tx.appointment.update({
        where: { id: current.appointmentId },
        data: {
          status: dto.decision === 'APPROVED' ? 'CONFIRMED' : 'CANCELLED',
          holdExpiresAt: null,
          cancelledAt: dto.decision === 'REJECTED' ? now : null,
        },
      });
      return tx.depositPayment.findUniqueOrThrow({
        where: { id: depositId },
        include: this.depositInclude,
      });
    });
    await this.record(
      actor,
      request,
      dto.decision === 'APPROVED' ? 'DEPOSIT_APPROVED' : 'DEPOSIT_REJECTED',
      'DepositPayment',
      deposit.id,
      { appointmentId: deposit.appointmentId, notes: dto.notes?.trim() || null },
    );
    if (deposit.appointment.clientId) {
      await this.notifications
        .notify({
          userId: deposit.appointment.clientId,
          kind: 'PAYMENT',
          title:
            dto.decision === 'APPROVED'
              ? 'Tu cita está confirmada'
              : 'El anticipo necesita atención',
          body:
            dto.decision === 'APPROVED'
              ? `Aprobamos el anticipo. Tu cita con ${deposit.appointment.technician.fullName} ya está confirmada.`
              : `El comprobante no fue aprobado.${dto.notes?.trim() ? ` Motivo: ${dto.notes.trim()}` : ''}`,
          actionUrl: dto.decision === 'APPROVED' ? '/agenda' : '/anticipo',
          templateKey: 'payment_update',
          dedupeKey: `deposit-reviewed:${deposit.id}:client`,
          external: true,
        })
        .catch(() => null);
    }
    if (dto.decision === 'APPROVED') {
      await this.notifications
        .notify({
          userId: deposit.appointment.technicianId,
          kind: 'PAYMENT',
          title: 'Cita confirmada por anticipo',
          body: `${deposit.appointment.client?.fullName ?? 'La clienta o cliente'} ya tiene el anticipo aprobado.`,
          actionUrl: '/agenda',
          templateKey: 'payment_update',
          dedupeKey: `deposit-reviewed:${deposit.id}:technician`,
          external: true,
        })
        .catch(() => null);
    }
    await this.calendars.syncAppointment(deposit.appointmentId);
    return { deposit: this.safeDeposit(deposit, true) };
  }

  async receipt(actor: AuthenticatedUser, depositId: string): Promise<PrivateReceipt> {
    const deposit = await this.prisma.depositPayment.findUnique({
      where: { id: depositId },
      include: { appointment: true },
    });
    if (!deposit?.objectKey || !deposit.mimeType || !deposit.filename) {
      throw new NotFoundException('Este anticipo no tiene comprobante cargado.');
    }
    const authorized =
      actor.role === 'ADMIN' ||
      (actor.role === 'CLIENT' && deposit.appointment.clientId === actor.id);
    if (!authorized) {
      throw new ForbiddenException(
        'Solo el cliente de la cita y la administradora pueden ver este comprobante.',
      );
    }
    return {
      stream: await this.storage.getObject(deposit.objectKey),
      mimeType: deposit.mimeType,
      filename: deposit.filename,
    };
  }

  async confirmation(actor: AuthenticatedUser, appointmentId: string) {
    const deposit = await this.findAuthorized(actor, appointmentId);
    if (deposit.status !== 'APPROVED' || !deposit.confirmationCode) {
      throw new ConflictException('La reservación todavía no tiene un anticipo aprobado.');
    }
    return {
      receipt: {
        folio: deposit.confirmationCode,
        reference: deposit.reference,
        amountCents: deposit.amountCents,
        approvedAt: deposit.reviewedAt,
        client: deposit.appointment.client,
        technician: deposit.appointment.technician,
        startAt: deposit.appointment.startAt,
        durationMinutes: deposit.appointment.durationMinutes,
        notice: 'Comprobante digital de reservación. No es un CFDI.',
      },
    };
  }

  async expireAwaitingReceipts() {
    const expired = await this.prisma.$transaction(async (tx) => {
      const appointments = await tx.appointment.findMany({
        where: { status: 'HELD', holdExpiresAt: { lte: new Date() } },
        select: { id: true },
      });
      if (!appointments.length) return 0;
      const ids = appointments.map(({ id }) => id);
      await tx.appointment.updateMany({
        where: { id: { in: ids }, status: 'HELD' },
        data: { status: 'EXPIRED' },
      });
      await tx.depositPayment.updateMany({
        where: { appointmentId: { in: ids }, status: 'AWAITING_RECEIPT' },
        data: { status: 'EXPIRED' },
      });
      return ids.length;
    });
    return { expired };
  }

  async cancelForAppointment(tx: Prisma.TransactionClient, appointmentId: string) {
    await tx.depositPayment.updateMany({
      where: {
        appointmentId,
        status: { in: ['AWAITING_RECEIPT', 'PENDING_REVIEW'] },
      },
      data: { status: 'CANCELLED' },
    });
  }

  async purgeExpiredReceiptFiles() {
    const expired = await this.prisma.depositPayment.findMany({
      where: { objectKey: { not: null }, retentionUntil: { lte: new Date() } },
      select: { id: true, objectKey: true },
      orderBy: { retentionUntil: 'asc' },
      take: 100,
    });
    let purged = 0;
    for (const receipt of expired) {
      if (!receipt.objectKey) continue;
      await this.storage.removeObject(receipt.objectKey);
      const result = await this.prisma.depositPayment.updateMany({
        where: { id: receipt.id, objectKey: receipt.objectKey },
        data: {
          objectKey: null,
          mimeType: null,
          filename: null,
          sizeBytes: null,
          receiptUploadedAt: null,
          retentionUntil: null,
          receiptPurgedAt: new Date(),
        },
      });
      purged += result.count;
    }
    return { purged };
  }

  private async settings() {
    return this.prisma.paymentSettings.findUniqueOrThrow({ where: { id: 'default' } });
  }

  private async findAuthorized(actor: AuthenticatedUser, appointmentId: string) {
    const deposit = await this.prisma.depositPayment.findUnique({
      where: { appointmentId },
      include: this.depositInclude,
    });
    if (!deposit) throw new NotFoundException('Esta cita no tiene un anticipo en línea.');
    const allowed =
      actor.role === 'ADMIN' ||
      (actor.role === 'CLIENT' && deposit.appointment.clientId === actor.id) ||
      (actor.role === 'NAIL_TECHNICIAN' && deposit.appointment.technicianId === actor.id);
    if (!allowed) throw new ForbiddenException('No tienes permisos sobre este anticipo.');
    return deposit;
  }

  private assertReceipt(file?: UploadedReceipt): UploadedReceipt {
    if (!file) throw new BadRequestException('Selecciona tu comprobante.');
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype)) {
      throw new BadRequestException('Usa un archivo JPG, PNG, WebP o PDF.');
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new BadRequestException('El comprobante no puede superar 8 MB.');
    }
    return file;
  }

  private safeFilename(filename: string) {
    return (
      filename
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .slice(-120) || 'comprobante'
    );
  }

  private reference(now: Date) {
    const yy = now.getUTCFullYear().toString().slice(-2);
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `DA-${yy}${mm}${dd}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private safeDeposit(deposit: DepositRecord, admin: boolean) {
    return {
      id: deposit.id,
      appointmentId: deposit.appointmentId,
      reference: deposit.reference,
      amountCents: deposit.amountCents,
      status: deposit.status,
      recipientName: deposit.recipientNameSnapshot,
      bankName: deposit.bankNameSnapshot,
      clabe: deposit.clabeSnapshot,
      accountNumber: deposit.accountNumberSnapshot,
      transferNotes: deposit.transferNotesSnapshot,
      receipt: deposit.objectKey
        ? {
            filename: deposit.filename,
            mimeType: deposit.mimeType,
            sizeBytes: deposit.sizeBytes,
            uploadedAt: deposit.receiptUploadedAt,
            retentionUntil: deposit.retentionUntil,
          }
        : null,
      acceptedPolicyVersion: deposit.acceptedPolicyVersion,
      reviewedAt: deposit.reviewedAt,
      reviewNotes: deposit.reviewNotes,
      confirmationCode: deposit.confirmationCode,
      reviewer: admin ? deposit.reviewedBy : undefined,
      appointment: deposit.appointment,
      createdAt: deposit.createdAt,
    };
  }

  private async record(
    actor: AuthenticatedUser,
    request: Request,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    await this.audit.record({
      actorUserId: actor.id,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress: requestIp(request),
    });
  }

  private readonly depositInclude = {
    appointment: {
      select: {
        id: true,
        status: true,
        source: true,
        clientId: true,
        technicianId: true,
        startAt: true,
        endAt: true,
        durationMinutes: true,
        holdExpiresAt: true,
        notes: true,
        client: { select: { id: true, fullName: true, phone: true, sex: true } },
        technician: { select: { id: true, fullName: true } },
      },
    },
    reviewedBy: { select: { id: true, fullName: true } },
  } as const;
}

type DepositRecord = Prisma.DepositPaymentGetPayload<{
  include: {
    appointment: {
      select: {
        id: true;
        status: true;
        source: true;
        clientId: true;
        technicianId: true;
        startAt: true;
        endAt: true;
        durationMinutes: true;
        holdExpiresAt: true;
        notes: true;
        client: { select: { id: true; fullName: true; phone: true; sex: true } };
        technician: { select: { id: true; fullName: true } };
      };
    };
    reviewedBy: { select: { id: true; fullName: true } };
  };
}>;
