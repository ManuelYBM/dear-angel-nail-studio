import { Injectable, Logger } from '@nestjs/common';
import type { DeliveryChannel, NotificationKind, Prisma } from '@prisma/client';

import { PrismaService } from '../infrastructure/prisma.service';
import { MessagingService } from '../identity/messaging.service';

export interface CreateNotificationInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  actionUrl?: string;
  templateKey?: string;
  dedupeKey?: string;
  payload?: Prisma.InputJsonValue;
  external?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  async list(userId: string, unreadOnly = false, take = 50) {
    const items = await this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      include: { deliveries: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return { items };
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: result.count };
  }

  templates() {
    return this.prisma.notificationTemplate.findMany({ orderBy: { label: 'asc' } });
  }

  async updateTemplate(
    key: string,
    data: {
      label: string;
      titleTemplate: string;
      bodyTemplate: string;
      whatsappTemplateName?: string;
      active?: boolean;
    },
  ) {
    return this.prisma.notificationTemplate.update({
      where: { key },
      data: {
        label: data.label.trim(),
        titleTemplate: data.titleTemplate.trim(),
        bodyTemplate: data.bodyTemplate.trim(),
        whatsappTemplateName: data.whatsappTemplateName?.trim() || null,
        active: data.active,
      },
    });
  }

  async notify(input: CreateNotificationInput) {
    const [user, template] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: input.userId } }),
      input.templateKey
        ? this.prisma.notificationTemplate.findUnique({ where: { key: input.templateKey } })
        : null,
    ]);
    if (!user || user.status === 'ARCHIVED') return null;
    const channel: DeliveryChannel | null = user.phone ? 'WHATSAPP' : user.email ? 'EMAIL' : null;
    const destination = channel === 'WHATSAPP' ? user.phone : user.email;
    try {
      return await this.prisma.notification.create({
        data: {
          userId: input.userId,
          kind: input.kind,
          title: template?.active
            ? this.render(template.titleTemplate, input.title, input.body)
            : input.title,
          body: template?.active
            ? this.render(template.bodyTemplate, input.title, input.body)
            : input.body,
          actionUrl: input.actionUrl,
          templateKey: input.templateKey,
          dedupeKey: input.dedupeKey,
          payload: input.payload,
          ...(input.external && channel && destination
            ? {
                deliveries: {
                  create: { channel, destination },
                },
              }
            : {}),
        },
      });
    } catch (error) {
      if (this.isUniqueError(error) && input.dedupeKey) {
        return this.prisma.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
      }
      throw error;
    }
  }

  async notifyMany(
    userIds: string[],
    input: Omit<CreateNotificationInput, 'userId' | 'dedupeKey'> & { dedupePrefix?: string },
  ) {
    await Promise.all(
      [...new Set(userIds)].map((userId) =>
        this.notify({
          ...input,
          userId,
          dedupeKey: input.dedupePrefix ? `${input.dedupePrefix}:${userId}` : undefined,
        }).catch((error) =>
          this.logger.error(
            `No se pudo registrar aviso para ${userId}: ${this.errorMessage(error)}`,
          ),
        ),
      ),
    );
  }

  async processPending(limit = 25) {
    const now = new Date();
    const stale = new Date(now.getTime() - 10 * 60_000);
    await this.prisma.notificationDelivery.updateMany({
      where: { status: 'PROCESSING', lockedAt: { lt: stale }, attempts: { lt: 5 } },
      data: { status: 'FAILED', lockedAt: null, nextAttemptAt: now },
    });
    const candidates = await this.prisma.notificationDelivery.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        attempts: { lt: 5 },
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
    });
    let processed = 0;
    for (const candidate of candidates) {
      const claimed = await this.prisma.notificationDelivery.updateMany({
        where: {
          id: candidate.id,
          status: { in: ['PENDING', 'FAILED'] },
          nextAttemptAt: { lte: now },
        },
        data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;
      const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { notification: { include: { template: true } } },
      });
      try {
        const receipt = await this.messaging.sendNotification(
          delivery.channel,
          delivery.destination,
          delivery.notification.title,
          delivery.notification.body,
          delivery.notification.template?.whatsappTemplateName ?? undefined,
        );
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SENT',
            provider: receipt.provider,
            externalId: receipt.externalId,
            sentAt: new Date(),
            lockedAt: null,
            lastError: null,
          },
        });
      } catch (error) {
        const delays = [1, 5, 30, 120, 360];
        const delayMinutes = delays[Math.min(delivery.attempts - 1, delays.length - 1)] ?? 360;
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'FAILED',
            lockedAt: null,
            lastError: this.errorMessage(error).slice(0, 1000),
            nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
          },
        });
      }
      processed += 1;
    }
    return { processed };
  }

  async queueAppointmentReminders() {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60_000);
    const appointments = await this.prisma.appointment.findMany({
      where: { status: 'CONFIRMED', startAt: { gt: now, lte: in24Hours } },
      include: { client: true, technician: true },
      take: 500,
    });
    for (const appointment of appointments) {
      const hours = (appointment.startAt.getTime() - now.getTime()) / 3_600_000;
      const window = hours <= 2 ? '2h' : hours >= 23.5 ? '24h' : null;
      if (!window) continue;
      const title = window === '2h' ? 'Tu cita es en unas horas' : 'Tu cita es mañana';
      const body = `${appointment.startAt.toLocaleString('es-MX', {
        timeZone: process.env.TZ ?? 'America/Merida',
        dateStyle: 'long',
        timeStyle: 'short',
      })} con ${appointment.technician.fullName}.`;
      if (appointment.clientId) {
        await this.notify({
          userId: appointment.clientId,
          kind: 'REMINDER',
          title,
          body,
          actionUrl: '/agenda',
          templateKey: 'appointment_reminder',
          dedupeKey: `reminder:${window}:${appointment.id}:client`,
          external: true,
        });
      }
      await this.notify({
        userId: appointment.technicianId,
        kind: 'REMINDER',
        title: `Cita próxima · ${window}`,
        body,
        actionUrl: '/agenda',
        templateKey: 'appointment_reminder',
        dedupeKey: `reminder:${window}:${appointment.id}:technician`,
        external: true,
      });
    }
    return { appointments: appointments.length };
  }

  async deliveryReport() {
    const [counts, failures] = await Promise.all([
      this.prisma.notificationDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.notificationDelivery.findMany({
        where: { status: 'FAILED' },
        include: {
          notification: { select: { title: true, user: { select: { fullName: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);
    return { counts, failures };
  }

  private render(template: string, title: string, body: string) {
    return template.replaceAll('{{titulo}}', title).replaceAll('{{mensaje}}', body);
  }

  private isUniqueError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
