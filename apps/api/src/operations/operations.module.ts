import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { PaymentsModule } from '../payments/payments.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { BackgroundJobsController } from './background-jobs.controller';
import { AdminOperationsController, StudioController } from './operations.controller';
import { ReportsService } from './reports.service';
import { StudioService } from './studio.service';

@Module({
  imports: [IdentityModule, SchedulingModule, PaymentsModule],
  controllers: [StudioController, AdminOperationsController, BackgroundJobsController],
  providers: [ReportsService, StudioService],
})
export class OperationsModule {}
