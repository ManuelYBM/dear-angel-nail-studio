import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PendingRegistrationService } from './pending-registration.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class PendingRegistrationBootstrapService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingRegistrationBootstrapService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly pendingRegistrations: PendingRegistrationService) {}

  async onModuleInit(): Promise<void> {
    if ((process.env.BACKGROUND_JOBS_MODE ?? 'worker') === 'worker') return;
    await this.cleanup();
    this.cleanupTimer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  private async cleanup(): Promise<void> {
    try {
      const { expiredRegistrationsDeleted } = await this.pendingRegistrations.purgeExpired();
      if (expiredRegistrationsDeleted) {
        this.logger.log(`${expiredRegistrationsDeleted} autorregistro(s) vencido(s) eliminado(s)`);
      }
    } catch (error) {
      this.logger.error(
        'No se pudieron limpiar los autorregistros vencidos',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
