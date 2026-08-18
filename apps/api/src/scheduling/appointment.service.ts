import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Appointment, AppointmentStatus } from '@prisma/client';
import { addDays, addMinutes } from 'date-fns';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../common/auth.types';
import { requestIp } from '../common/request-meta';
import { PrismaService } from '../infrastructure/prisma.service';
import { AuditService } from '../identity/audit.service';
import { PhoneService } from '../identity/phone.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PaymentsService } from '../payments/payments.service';
import { CalendarService } from '../notifications/calendar.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AppointmentListQueryDto,
  AvailabilityQueryDto,
  CreateHoldDto,
  CreateManualAppointmentDto,
  RescheduleAppointmentDto,
} from './scheduling.dto';
import { canCloseAppointment } from './appointment.rules';
import { ScheduleService } from './schedule.service';
import { TimeService } from './time.service';

const BLOCKING_STATUSES: AppointmentStatus[] = ['HELD', 'PENDING_PAYMENT', 'CONFIRMED'];

@Injectable()
export class AppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: ScheduleService,
    private readonly time: TimeService,
    private readonly phones: PhoneService,
    private readonly audit: AuditService,
    private readonly loyalty: LoyaltyService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly calendars: CalendarService,
  ) {}

  async availability(query: AvailabilityQueryDto) {
    await this.expireHolds();
    const policy = await this.schedules.getPolicy();
    const durationMinutes = query.durationMinutes ?? policy.defaultDurationMinutes;
    this.assertPublicRange(query.from, query.to, policy.maximumAdvanceDays);
    const technicians = await this.schedules.activeTechnicians(query.technicianId);
    if (query.technicianId && technicians.length === 0) {
      throw new NotFoundException({
        code: 'TECHNICIAN_NOT_AVAILABLE',
        message: 'Esta manicurista no está recibiendo citas.',
      });
    }

    const rangeStart = this.time.startOfDate(query.from);
    const rangeEnd = this.time.startOfDate(this.time.nextDate(query.to));
    const existing = await this.prisma.appointment.findMany({
      where: {
        technicianId: { in: technicians.map(({ id }) => id) },
        status: { in: BLOCKING_STATUSES },
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: { technicianId: true, startAt: true, endAt: true },
    });
    const minimumStart = new Date(Date.now() + policy.minimumLeadMinutes * 60_000);
    const maximumStart = addDays(new Date(), policy.maximumAdvanceDays);
    const days: Array<{
      date: string;
      slots: Array<{
        startAt: string;
        endAt: string;
        technicians: Array<{ id: string; fullName: string }>;
      }>;
    }> = [];

    for (let date = query.from; date <= query.to; date = this.time.nextDate(date)) {
      const slots = new Map<
        string,
        { startAt: string; endAt: string; technicians: Array<{ id: string; fullName: string }> }
      >();
      for (const technician of technicians) {
        const periods = await this.schedules.periodsFor(technician.id, date);
        for (const period of periods) {
          let minute =
            Math.ceil(period.startMinute / policy.slotIntervalMinutes) * policy.slotIntervalMinutes;
          for (
            ;
            minute + durationMinutes <= period.endMinute;
            minute += policy.slotIntervalMinutes
          ) {
            const startAt = this.time.dateAndMinute(date, minute);
            const endAt = addMinutes(startAt, durationMinutes);
            if (startAt < minimumStart || startAt > maximumStart) continue;
            const overlaps = existing.some(
              (appointment) =>
                appointment.technicianId === technician.id &&
                appointment.startAt < endAt &&
                appointment.endAt > startAt,
            );
            if (overlaps) continue;
            const key = startAt.toISOString();
            const slot = slots.get(key) ?? {
              startAt: key,
              endAt: endAt.toISOString(),
              technicians: [],
            };
            slot.technicians.push(technician);
            slots.set(key, slot);
          }
        }
      }
      days.push({
        date,
        slots: [...slots.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)),
      });
    }
    return {
      policy: {
        durationMinutes,
        slotIntervalMinutes: policy.slotIntervalMinutes,
        minimumLeadMinutes: policy.minimumLeadMinutes,
        maximumAdvanceDays: policy.maximumAdvanceDays,
        holdMinutes: policy.holdMinutes,
      },
      days,
    };
  }

  async createHold(user: AuthenticatedUser, dto: CreateHoldDto, request: Request) {
    await this.expireHolds();
    const policy = await this.schedules.getPolicy();
    if (dto.catalogDesignId && dto.customQuoteId) {
      throw new BadRequestException('Selecciona un diseño de catálogo o una cotización, no ambos.');
    }
    const design = dto.catalogDesignId
      ? await this.prisma.catalogDesign.findFirst({
          where: { id: dto.catalogDesignId, published: true },
        })
      : null;
    if (dto.catalogDesignId && !design)
      throw new NotFoundException('Este diseño ya no está disponible.');
    const quote = dto.customQuoteId
      ? await this.prisma.customQuote.findFirst({
          where: { id: dto.customQuoteId, clientId: user.id, status: 'APPROVED' },
        })
      : null;
    if (
      dto.customQuoteId &&
      (!quote || !quote.confirmedDurationMinutes || !quote.assignedTechnicianId)
    ) {
      throw new ConflictException({
        code: 'QUOTE_NOT_BOOKABLE',
        message: 'La cotización todavía no está lista para reservar.',
      });
    }
    if (
      quote &&
      (await this.prisma.appointment.count({
        where: { customQuoteId: quote.id, status: { in: BLOCKING_STATUSES } },
      })) > 0
    ) {
      throw new ConflictException({
        code: 'QUOTE_ALREADY_BOOKED',
        message: 'Esta cotización ya tiene un horario apartado o confirmado.',
      });
    }
    if (quote && dto.technicianId && dto.technicianId !== quote.assignedTechnicianId) {
      throw new BadRequestException(
        'Esta cotización debe reservarse con la manicurista que la revisó.',
      );
    }
    const durationMinutes =
      quote?.confirmedDurationMinutes ?? design?.durationMinutes ?? policy.defaultDurationMinutes;
    const startAt = this.parseMinute(dto.startAt);
    const endAt = addMinutes(startAt, durationMinutes);
    this.assertPublicStart(startAt, policy);
    const candidates = await this.schedules.activeTechnicians(
      quote?.assignedTechnicianId ?? dto.technicianId,
    );
    if (!candidates.length) {
      throw new ConflictException({
        code: 'NO_TECHNICIAN_AVAILABLE',
        message: 'No hay una manicurista disponible para ese horario.',
      });
    }

    for (const technician of candidates) {
      if (!(await this.schedules.isWithinAvailability(technician.id, startAt, endAt))) continue;
      try {
        const appointment = await this.prisma.$transaction(async (tx) => {
          const created = await tx.appointment.create({
            data: {
              technicianId: technician.id,
              clientId: user.id,
              createdByUserId: user.id,
              source: 'ONLINE',
              status: 'HELD',
              startAt,
              endAt,
              durationMinutes,
              holdExpiresAt: addMinutes(new Date(), policy.holdMinutes),
              notes:
                dto.notes?.trim() ||
                (design
                  ? `Diseño de catálogo: ${design.title}`
                  : quote
                    ? `Cotización personalizada ${quote.id}`
                    : 'Diseño por definir'),
              catalogDesignId: design?.id,
              customQuoteId: quote?.id,
            },
          });
          await this.payments.createForAppointment(tx, created.id);
          return tx.appointment.findUniqueOrThrow({
            where: { id: created.id },
            include: this.appointmentInclude,
          });
        });
        await this.audit.record({
          actorUserId: user.id,
          action: 'APPOINTMENT_HELD',
          entityType: 'Appointment',
          entityId: appointment.id,
          metadata: { technicianId: technician.id, startAt: startAt.toISOString() },
          ipAddress: requestIp(request),
        });
        await this.notifications
          .notify({
            userId: technician.id,
            kind: 'APPOINTMENT',
            title: 'Nuevo horario apartado',
            body: `${user.fullName} apartó un horario pendiente de anticipo.`,
            actionUrl: '/agenda',
            templateKey: 'appointment_update',
            dedupeKey: `appointment-held:${appointment.id}:${technician.id}`,
            external: true,
          })
          .catch(() => null);
        return { appointment: this.safeAppointment(appointment) };
      } catch (error) {
        if (this.isQuoteBookingError(error)) {
          throw new ConflictException({
            code: 'QUOTE_ALREADY_BOOKED',
            message: 'Esta cotización ya tiene un horario apartado o confirmado.',
          });
        }
        if (!this.isOverlapError(error)) throw error;
      }
    }
    throw new ConflictException({
      code: 'SLOT_JUST_TAKEN',
      message: 'Ese horario acaba de ocuparse. Elige otro disponible.',
    });
  }

  private isQuoteBookingError(error: unknown): boolean {
    const target =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined;
    const fields = Array.isArray(target)
      ? target.filter((field): field is string => typeof field === 'string')
      : typeof target === 'string'
        ? [target]
        : [];
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      fields.some((field) => field.includes('custom_quote'))
    );
  }

  async createManual(actor: AuthenticatedUser, dto: CreateManualAppointmentDto, request: Request) {
    await this.expireHolds();
    const technicianId = actor.role === 'NAIL_TECHNICIAN' ? actor.id : dto.technicianId;
    if (!technicianId) {
      throw new BadRequestException({
        code: 'TECHNICIAN_REQUIRED',
        message: 'Selecciona una manicurista.',
      });
    }
    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, role: 'NAIL_TECHNICIAN', status: 'ACTIVE' },
    });
    if (!technician) {
      throw new NotFoundException({
        code: 'TECHNICIAN_NOT_FOUND',
        message: 'No encontramos esta manicurista activa.',
      });
    }

    const client = await this.resolveClient(dto.clientId, dto.clientPhone);
    const guestPhone =
      !client && (dto.guestPhone || dto.clientPhone)
        ? this.phones.normalize(dto.guestPhone || dto.clientPhone || '')
        : undefined;
    if (!client && !dto.guestName?.trim()) {
      throw new BadRequestException({
        code: 'GUEST_NAME_REQUIRED',
        message: 'Escribe el nombre de la clienta no registrada.',
      });
    }
    const startAt = this.parseMinute(dto.startAt);
    const endAt = addMinutes(startAt, dto.durationMinutes);
    if (!(await this.schedules.isWithinAvailability(technicianId, startAt, endAt))) {
      throw new ConflictException({
        code: 'OUTSIDE_AVAILABILITY',
        message: 'La cita no cabe dentro de la disponibilidad de la manicurista.',
      });
    }
    try {
      const appointment = await this.prisma.appointment.create({
        data: {
          technicianId,
          clientId: client?.id,
          createdByUserId: actor.id,
          source: 'MANUAL',
          status: 'CONFIRMED',
          startAt,
          endAt,
          durationMinutes: dto.durationMinutes,
          guestName: client ? undefined : dto.guestName?.trim(),
          guestPhone,
          notes: dto.notes?.trim(),
        },
        include: this.appointmentInclude,
      });
      await this.audit.record({
        actorUserId: actor.id,
        action: 'MANUAL_APPOINTMENT_CREATED',
        entityType: 'Appointment',
        entityId: appointment.id,
        metadata: { technicianId, startAt: startAt.toISOString() },
        ipAddress: requestIp(request),
      });
      if (appointment.clientId) {
        await this.notifications
          .notify({
            userId: appointment.clientId,
            kind: 'APPOINTMENT',
            title: 'Tu cita quedó registrada',
            body: `Tu cita con ${technician.fullName} ya está confirmada.`,
            actionUrl: '/agenda',
            templateKey: 'appointment_update',
            dedupeKey: `manual-appointment:${appointment.id}:client`,
            external: true,
          })
          .catch(() => null);
      }
      if (actor.id !== technicianId) {
        await this.notifications
          .notify({
            userId: technicianId,
            kind: 'APPOINTMENT',
            title: 'Nueva cita en tu agenda',
            body: `Se agregó una cita para ${appointment.client?.fullName ?? appointment.guestName ?? 'una clienta o cliente'}.`,
            actionUrl: '/agenda',
            templateKey: 'appointment_update',
            dedupeKey: `manual-appointment:${appointment.id}:technician`,
            external: true,
          })
          .catch(() => null);
      }
      await this.calendars.syncAppointment(appointment.id);
      return { appointment: this.safeAppointment(appointment) };
    } catch (error) {
      if (this.isOverlapError(error)) {
        throw new ConflictException({
          code: 'APPOINTMENT_OVERLAP',
          message: 'La cita se traslapa con otra cita de la manicurista.',
        });
      }
      throw error;
    }
  }

  async list(user: AuthenticatedUser, query: AppointmentListQueryDto) {
    await this.expireHolds();
    if (query.from) this.time.assertDate(query.from);
    if (query.to) this.time.assertDate(query.to);
    const limit = query.limit ?? 300;
    const appointments = await this.prisma.appointment.findMany({
      where: {
        ...(user.role === 'CLIENT'
          ? { clientId: user.id }
          : user.role === 'NAIL_TECHNICIAN'
            ? { technicianId: user.id }
            : {}),
        ...(query.from || query.to
          ? {
              startAt: {
                ...(query.from ? { gte: this.time.startOfDate(query.from) } : {}),
                ...(query.to ? { lt: this.time.startOfDate(this.time.nextDate(query.to)) } : {}),
              },
            }
          : {}),
      },
      include: this.appointmentInclude,
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = appointments.length > limit;
    if (hasMore) appointments.pop();
    const nextCursor = hasMore ? (appointments.at(-1)?.id ?? null) : null;
    const policy = await this.schedules.getPolicy();
    return {
      items: appointments.reverse().map((appointment) => this.safeAppointment(appointment)),
      nextCursor,
      policy,
    };
  }

  async reschedule(
    actor: AuthenticatedUser,
    appointmentId: string,
    dto: RescheduleAppointmentDto,
    request: Request,
  ) {
    await this.expireHolds();
    const appointment = await this.findAuthorized(actor, appointmentId);
    if (!BLOCKING_STATUSES.includes(appointment.status)) {
      throw new ConflictException({
        code: 'APPOINTMENT_NOT_RESCHEDULABLE',
        message: 'Esta cita ya no puede reprogramarse.',
      });
    }
    const policy = await this.schedules.getPolicy();
    if (actor.role === 'CLIENT') {
      if (appointment.clientRescheduleCount >= policy.clientRescheduleLimit) {
        throw new ConflictException({
          code: 'CLIENT_RESCHEDULE_LIMIT',
          message: 'Ya utilizaste la reprogramación disponible para esta cita.',
        });
      }
      if (appointment.startAt.getTime() - Date.now() < policy.rescheduleNoticeHours * 3_600_000) {
        throw new ConflictException({
          code: 'RESCHEDULE_NOTICE_REQUIRED',
          message: `La cita debe modificarse con al menos ${policy.rescheduleNoticeHours} horas de anticipación.`,
        });
      }
    }

    const startAt = this.parseMinute(dto.startAt);
    const endAt = addMinutes(startAt, appointment.durationMinutes);
    if (actor.role === 'CLIENT') this.assertPublicStart(startAt, policy);
    const technicianId = dto.technicianId ?? appointment.technicianId;
    if (actor.role !== 'ADMIN' && technicianId !== appointment.technicianId) {
      throw new ForbiddenException({
        code: 'TECHNICIAN_REASSIGN_FORBIDDEN',
        message: 'Solo la administradora puede reasignar una cita a otra manicurista.',
      });
    }
    const [technician] = await this.schedules.activeTechnicians(technicianId);
    if (!technician) {
      throw new ConflictException({
        code: 'TECHNICIAN_NOT_AVAILABLE',
        message: 'La manicurista seleccionada no está activa o no está recibiendo citas.',
      });
    }
    if (appointment.customQuoteId) {
      const quote = await this.prisma.customQuote.findUnique({
        where: { id: appointment.customQuoteId },
        select: { assignedTechnicianId: true, status: true },
      });
      if (!quote || quote.status !== 'APPROVED' || quote.assignedTechnicianId !== technicianId) {
        throw new ConflictException({
          code: 'QUOTE_TECHNICIAN_REQUIRED',
          message: 'Esta cita debe conservar a la manicurista que aprobó la cotización.',
        });
      }
    }
    if (!(await this.schedules.isWithinAvailability(technicianId, startAt, endAt))) {
      throw new ConflictException({
        code: 'OUTSIDE_AVAILABILITY',
        message: 'La cita no cabe dentro de la disponibilidad seleccionada.',
      });
    }
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.appointment.updateMany({
          where: {
            id: appointment.id,
            status: appointment.status,
            updatedAt: appointment.updatedAt,
          },
          data: {
            technicianId,
            startAt,
            endAt,
            clientRescheduleCount:
              actor.role === 'CLIENT' ? { increment: 1 } : appointment.clientRescheduleCount,
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException({
            code: 'APPOINTMENT_ALREADY_CHANGED',
            message: 'La cita acaba de cambiar. Recarga la agenda antes de reprogramarla.',
          });
        }
        return tx.appointment.findUniqueOrThrow({
          where: { id: appointment.id },
          include: this.appointmentInclude,
        });
      });
      await this.audit.record({
        actorUserId: actor.id,
        action: 'APPOINTMENT_RESCHEDULED',
        entityType: 'Appointment',
        entityId: appointment.id,
        metadata: {
          previousStartAt: appointment.startAt.toISOString(),
          startAt: startAt.toISOString(),
          actorRole: actor.role,
        },
        ipAddress: requestIp(request),
      });
      if (updated.clientId) {
        await this.notifications
          .notify({
            userId: updated.clientId,
            kind: 'APPOINTMENT',
            title: 'Tu cita cambió de horario',
            body: `Revisa la nueva fecha y hora de tu cita con ${updated.technician.fullName}.`,
            actionUrl: '/agenda',
            templateKey: 'appointment_update',
            dedupeKey: `appointment-rescheduled:${updated.id}:${updated.updatedAt.toISOString()}:client`,
            external: true,
          })
          .catch(() => null);
      }
      await this.notifications
        .notify({
          userId: updated.technicianId,
          kind: 'APPOINTMENT',
          title: 'Una cita cambió de horario',
          body: `Revisa la nueva fecha y hora de ${updated.client?.fullName ?? updated.guestName ?? 'la cita'}.`,
          actionUrl: '/agenda',
          templateKey: 'appointment_update',
          dedupeKey: `appointment-rescheduled:${updated.id}:${updated.updatedAt.toISOString()}:technician`,
          external: true,
        })
        .catch(() => null);
      if (appointment.technicianId !== updated.technicianId) {
        await this.calendars.moveAppointment(updated.id, appointment.technicianId);
      } else {
        await this.calendars.syncAppointment(updated.id);
      }
      return { appointment: this.safeAppointment(updated) };
    } catch (error) {
      if (this.isOverlapError(error)) {
        throw new ConflictException({
          code: 'APPOINTMENT_OVERLAP',
          message: 'El nuevo horario se traslapa con otra cita.',
        });
      }
      throw error;
    }
  }

  async cancel(actor: AuthenticatedUser, appointmentId: string, request: Request) {
    const appointment = await this.findAuthorized(actor, appointmentId);
    if (!BLOCKING_STATUSES.includes(appointment.status)) {
      throw new ConflictException({
        code: 'APPOINTMENT_NOT_CANCELLABLE',
        message: 'Esta cita ya no puede cancelarse.',
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          status: appointment.status,
          updatedAt: appointment.updatedAt,
        },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          code: 'APPOINTMENT_ALREADY_CHANGED',
          message: 'La cita acaba de cambiar. Recarga la agenda antes de cancelarla.',
        });
      }
      await this.payments.cancelForAppointment(tx, appointment.id);
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: this.appointmentInclude,
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'APPOINTMENT_CANCELLED',
      entityType: 'Appointment',
      entityId: appointment.id,
      metadata: { actorRole: actor.role },
      ipAddress: requestIp(request),
    });
    if (updated.clientId) {
      await this.notifications
        .notify({
          userId: updated.clientId,
          kind: 'APPOINTMENT',
          title: 'Tu cita fue cancelada',
          body: 'El horario ya no aparece como reservado. Puedes consultar los detalles en tu agenda.',
          actionUrl: '/agenda',
          templateKey: 'appointment_update',
          dedupeKey: `appointment-cancelled:${updated.id}:client`,
          external: true,
        })
        .catch(() => null);
    }
    await this.notifications
      .notify({
        userId: updated.technicianId,
        kind: 'APPOINTMENT',
        title: 'Cita cancelada',
        body: `${updated.client?.fullName ?? updated.guestName ?? 'La cita'} ya no ocupa ese horario.`,
        actionUrl: '/agenda',
        templateKey: 'appointment_update',
        dedupeKey: `appointment-cancelled:${updated.id}:technician`,
        external: true,
      })
      .catch(() => null);
    await this.calendars.syncAppointment(updated.id);
    return { appointment: this.safeAppointment(updated) };
  }

  async updateStatus(
    actor: AuthenticatedUser,
    appointmentId: string,
    status: AppointmentStatus,
    request: Request,
  ) {
    const appointment = await this.findAuthorized(actor, appointmentId, true);
    const transitionAllowed =
      ['COMPLETED', 'NO_SHOW'].includes(status) && appointment.status === 'CONFIRMED';
    if (!transitionAllowed) {
      throw new ConflictException({
        code: 'INVALID_APPOINTMENT_TRANSITION',
        message: 'Ese cambio no corresponde al estado actual de la cita.',
      });
    }
    if (!canCloseAppointment(appointment.status, status, appointment.startAt, appointment.endAt)) {
      throw new ConflictException({
        code: status === 'COMPLETED' ? 'APPOINTMENT_NOT_FINISHED' : 'APPOINTMENT_NOT_STARTED',
        message:
          status === 'COMPLETED'
            ? 'La cita solo puede marcarse atendida después de su hora de finalización.'
            : 'La ausencia solo puede registrarse después de que comience la cita.',
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          status: appointment.status,
          updatedAt: appointment.updatedAt,
        },
        data: {
          status,
          holdExpiresAt: status === 'CONFIRMED' ? null : appointment.holdExpiresAt,
          completedAt: status === 'COMPLETED' ? new Date() : null,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          code: 'APPOINTMENT_ALREADY_CHANGED',
          message: 'La cita acaba de ser actualizada. Recarga la agenda para ver su estado.',
        });
      }
      if (status === 'COMPLETED') {
        await this.loyalty.registerCompletedAppointment(tx, appointment, actor.id);
      }
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: this.appointmentInclude,
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'APPOINTMENT_STATUS_CHANGED',
      entityType: 'Appointment',
      entityId: appointment.id,
      metadata: { previousStatus: appointment.status, status },
      ipAddress: requestIp(request),
    });
    if (status === 'COMPLETED' && updated.clientId) {
      await this.notifications
        .notify({
          userId: updated.clientId,
          kind: 'COUPON',
          title: 'Tu camino de recompensas avanzó',
          body: 'Registramos tu visita. Revisa si desbloqueaste un cupón nuevo.',
          actionUrl: '/recompensas',
          templateKey: 'coupon_unlocked',
          dedupeKey: `appointment-completed:${updated.id}:reward`,
          external: true,
        })
        .catch(() => null);
    }
    return { appointment: this.safeAppointment(updated) };
  }

  async expireHolds(): Promise<void> {
    await this.payments.expireAwaitingReceipts();
  }

  private assertPublicRange(from: string, to: string, maximumAdvanceDays: number): void {
    this.time.assertDate(from);
    this.time.assertDate(to);
    const today = this.time.dateKey(new Date());
    if (
      this.time.dateDistance(today, from) < 0 ||
      this.time.dateDistance(from, to) < 0 ||
      this.time.dateDistance(today, to) > maximumAdvanceDays
    ) {
      throw new BadRequestException({
        code: 'AVAILABILITY_RANGE_INVALID',
        message: `Consulta fechas desde hoy y hasta ${maximumAdvanceDays} días adelante.`,
      });
    }
  }

  private assertPublicStart(
    startAt: Date,
    policy: {
      minimumLeadMinutes: number;
      maximumAdvanceDays: number;
      slotIntervalMinutes: number;
    },
  ): void {
    const minutes = this.time.minuteOfDay(startAt);
    if (minutes % policy.slotIntervalMinutes !== 0) {
      throw new BadRequestException({
        code: 'SLOT_ALIGNMENT_REQUIRED',
        message: 'Selecciona uno de los horarios publicados.',
      });
    }
    if (startAt.getTime() < Date.now() + policy.minimumLeadMinutes * 60_000) {
      throw new ConflictException({
        code: 'MINIMUM_LEAD_REQUIRED',
        message: 'Ese horario ya está demasiado próximo para reservar en línea.',
      });
    }
    if (startAt > addDays(new Date(), policy.maximumAdvanceDays)) {
      throw new ConflictException({
        code: 'MAXIMUM_ADVANCE_EXCEEDED',
        message: 'Ese horario todavía no está abierto para reservar.',
      });
    }
  }

  private parseMinute(value: string): Date {
    const date = new Date(value);
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCSeconds() !== 0 ||
      date.getUTCMilliseconds() !== 0
    ) {
      throw new BadRequestException({
        code: 'INVALID_APPOINTMENT_TIME',
        message: 'La hora debe comenzar en un minuto exacto.',
      });
    }
    return date;
  }

  private async resolveClient(clientId?: string, clientPhone?: string) {
    if (clientId) {
      const client = await this.prisma.user.findFirst({
        where: {
          id: clientId,
          role: 'CLIENT',
          status: { not: 'ARCHIVED' },
          registrationExpiresAt: null,
        },
      });
      if (!client) {
        throw new NotFoundException({
          code: 'CLIENT_NOT_FOUND',
          message: 'No encontramos esa clienta registrada.',
        });
      }
      return client;
    }
    if (!clientPhone) return null;
    const phone = this.phones.normalize(clientPhone);
    return this.prisma.user.findFirst({
      where: {
        phone,
        role: 'CLIENT',
        status: { not: 'ARCHIVED' },
        registrationExpiresAt: null,
      },
    });
  }

  private async findAuthorized(
    actor: AuthenticatedUser,
    appointmentId: string,
    staffOnly = false,
  ): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) {
      throw new NotFoundException({
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'No encontramos esta cita.',
      });
    }
    const allowed =
      actor.role === 'ADMIN' ||
      (actor.role === 'NAIL_TECHNICIAN' && appointment.technicianId === actor.id) ||
      (!staffOnly && actor.role === 'CLIENT' && appointment.clientId === actor.id);
    if (!allowed) {
      throw new ForbiddenException({
        code: 'APPOINTMENT_FORBIDDEN',
        message: 'No tienes permisos sobre esta cita.',
      });
    }
    return appointment;
  }

  private isOverlapError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const detail = JSON.stringify(error.meta ?? {});
      if (['P2004', 'P2010', 'P2034'].includes(error.code)) return true;
      if (detail.includes('appointments_no_overlap') || detail.includes('23P01')) return true;
    }
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return (
      message.includes('appointments_no_overlap') ||
      message.includes('23P01') ||
      message.toLowerCase().includes('exclusion constraint')
    );
  }

  private safeAppointment(
    appointment: Appointment & {
      technician: { id: string; fullName: string };
      client: {
        id: string;
        fullName: string;
        phone: string | null;
        _count: { rewardCoupons: number };
      } | null;
      depositPayment: {
        id: string;
        reference: string;
        amountCents: number;
        status: string;
        confirmationCode: string | null;
      } | null;
    },
  ) {
    return {
      id: appointment.id,
      source: appointment.source,
      status: appointment.status,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      durationMinutes: appointment.durationMinutes,
      holdExpiresAt: appointment.holdExpiresAt,
      clientRescheduleCount: appointment.clientRescheduleCount,
      notes: appointment.notes,
      technician: appointment.technician,
      client: appointment.client
        ? {
            id: appointment.client.id,
            fullName: appointment.client.fullName,
            phone: appointment.client.phone,
            availableCouponCount: appointment.client._count.rewardCoupons,
          }
        : null,
      guest: appointment.client
        ? null
        : { name: appointment.guestName, phone: appointment.guestPhone },
      createdAt: appointment.createdAt,
      deposit: appointment.depositPayment
        ? {
            id: appointment.depositPayment.id,
            reference: appointment.depositPayment.reference,
            amountCents: appointment.depositPayment.amountCents,
            status: appointment.depositPayment.status,
            confirmationCode: appointment.depositPayment.confirmationCode,
          }
        : null,
    };
  }

  private readonly appointmentInclude = {
    technician: { select: { id: true, fullName: true } },
    client: {
      select: {
        id: true,
        fullName: true,
        phone: true,
        _count: { select: { rewardCoupons: { where: { status: 'AVAILABLE' } } } },
      },
    },
    depositPayment: {
      select: {
        id: true,
        reference: true,
        amountCents: true,
        status: true,
        confirmationCode: true,
      },
    },
  } as const;
}
