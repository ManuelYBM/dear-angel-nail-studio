import {
  Controller,
  Headers,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

import { Public } from '../common/auth.decorators';
import { PendingRegistrationService } from '../identity/pending-registration.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';

const JOBS = [
  'notification-deliveries',
  'appointment-reminders',
  'payment-expiry',
  'receipt-retention',
  'pending-registration-cleanup',
] as const;

type BackgroundJobName = (typeof JOBS)[number];

@Public()
@Controller('internal/jobs')
export class BackgroundJobsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly pendingRegistrations: PendingRegistrationService,
  ) {}

  @Post(':job')
  async run(@Param('job') job: string, @Headers('x-worker-token') token?: string) {
    this.assertWorkerToken(token);
    if (!JOBS.includes(job as BackgroundJobName)) {
      throw new NotFoundException('Trabajo interno no reconocido.');
    }
    switch (job as BackgroundJobName) {
      case 'notification-deliveries':
        return { job, ...(await this.notifications.processPending(100)) };
      case 'appointment-reminders':
        return { job, ...(await this.notifications.queueAppointmentReminders()) };
      case 'payment-expiry':
        return { job, ...(await this.payments.expireAwaitingReceipts()) };
      case 'receipt-retention':
        return { job, ...(await this.payments.purgeExpiredReceiptFiles()) };
      case 'pending-registration-cleanup':
        return { job, ...(await this.pendingRegistrations.purgeExpired()) };
    }
  }

  private assertWorkerToken(token?: string) {
    const expected =
      process.env.WORKER_SHARED_SECRET ??
      (process.env.NODE_ENV !== 'production'
        ? 'dear-angel-local-worker-secret-change-me'
        : undefined);
    if (!expected || !token) throw new UnauthorizedException('Worker no autorizado.');
    const expectedDigest = createHash('sha256').update(expected).digest();
    const actualDigest = createHash('sha256').update(token).digest();
    if (!timingSafeEqual(expectedDigest, actualDigest)) {
      throw new UnauthorizedException('Worker no autorizado.');
    }
  }
}
