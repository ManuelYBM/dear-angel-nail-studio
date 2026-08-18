import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../infrastructure/prisma.service';
import { PaymentsService } from './payments.service';

@Injectable()
export class BootstrapPaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BootstrapPaymentsService.name);
  private cleanupTimer?: NodeJS.Timeout;
  private expiryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  async onModuleInit() {
    await this.prisma.paymentSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    if ((process.env.BACKGROUND_JOBS_MODE ?? 'worker') === 'worker') return;
    await this.expireAwaitingReceipts();
    await this.cleanup();
    this.expiryTimer = setInterval(() => void this.expireAwaitingReceipts(), 60 * 1_000);
    this.expiryTimer.unref();
    this.cleanupTimer = setInterval(() => void this.cleanup(), 6 * 60 * 60 * 1_000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  private async expireAwaitingReceipts() {
    try {
      const { expired } = await this.payments.expireAwaitingReceipts();
      if (expired) this.logger.log(`${expired} anticipo(s) vencido(s)`);
    } catch (error) {
      this.logger.error(
        'No se pudieron vencer los anticipos sin comprobante',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async cleanup() {
    try {
      const { purged } = await this.payments.purgeExpiredReceiptFiles();
      if (purged) this.logger.log(`${purged} comprobante(s) vencido(s) eliminado(s)`);
    } catch (error) {
      this.logger.error(
        'No se pudo ejecutar la limpieza de comprobantes',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
