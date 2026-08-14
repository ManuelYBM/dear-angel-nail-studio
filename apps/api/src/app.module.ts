import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './health/health.controller';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { IdentityModule } from './identity/identity.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { CatalogModule } from './catalog/catalog.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OperationsModule } from './operations/operations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    InfrastructureModule,
    IdentityModule,
    NotificationsModule,
    SchedulingModule,
    CatalogModule,
    LoyaltyModule,
    PaymentsModule,
    OperationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
