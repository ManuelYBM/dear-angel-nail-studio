import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AdminOperationsController, StudioController } from './operations.controller';
import { ReportsService } from './reports.service';
import { StudioService } from './studio.service';

@Module({
  imports: [IdentityModule, SchedulingModule],
  controllers: [StudioController, AdminOperationsController],
  providers: [ReportsService, StudioService],
})
export class OperationsModule {}
