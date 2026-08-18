import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { PrismaService } from '../infrastructure/prisma.service';
import { NotificationsService } from './notifications.service';

const TEMPLATES = [
  ['appointment_update', 'Citas y cambios', '{{titulo}}', '{{mensaje}}'],
  ['appointment_reminder', 'Recordatorios', '{{titulo}}', '{{mensaje}}'],
  ['quote_update', 'Cotizaciones', '{{titulo}}', '{{mensaje}}'],
  ['payment_update', 'Anticipos', '{{titulo}}', '{{mensaje}}'],
  ['coupon_unlocked', 'Cupones', '{{titulo}}', '{{mensaje}}'],
] as const;

@Injectable()
export class NotificationsBootstrapService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationsBootstrapService.name);
  private deliveryTimer?: NodeJS.Timeout;
  private reminderTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async onApplicationBootstrap() {
    for (const [key, label, titleTemplate, bodyTemplate] of TEMPLATES) {
      const whatsappTemplateName =
        process.env[`WHATSAPP_TEMPLATE_${key.toUpperCase()}`]?.trim() || null;
      await this.prisma.notificationTemplate.upsert({
        where: { key },
        create: {
          key,
          label,
          titleTemplate,
          bodyTemplate,
          defaultChannel: 'WHATSAPP',
          whatsappTemplateName,
        },
        update: {},
      });
      if (whatsappTemplateName) {
        await this.prisma.notificationTemplate.updateMany({
          where: { key, whatsappTemplateName: null },
          data: { whatsappTemplateName },
        });
      }
    }
    if ((process.env.BACKGROUND_JOBS_MODE ?? 'worker') === 'worker') return;
    void this.runDeliveries();
    void this.runReminders();
    this.deliveryTimer = setInterval(() => void this.runDeliveries(), 30_000);
    this.reminderTimer = setInterval(() => void this.runReminders(), 5 * 60_000);
  }

  onApplicationShutdown() {
    if (this.deliveryTimer) clearInterval(this.deliveryTimer);
    if (this.reminderTimer) clearInterval(this.reminderTimer);
  }

  private async runDeliveries() {
    await this.notifications.processPending().catch((error) => this.logger.error(error));
  }

  private async runReminders() {
    await this.notifications.queueAppointmentReminders().catch((error) => this.logger.error(error));
  }
}
