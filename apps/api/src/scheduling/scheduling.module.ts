import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminSchedulingController } from './admin-scheduling.controller';
import { AppointmentService } from './appointment.service';
import { AppointmentsController } from './appointments.controller';
import { BootstrapSchedulingService } from './bootstrap-scheduling.service';
import { ScheduleService } from './schedule.service';
import { SchedulingController } from './scheduling.controller';
import { TimeService } from './time.service';

@Module({
  imports: [IdentityModule, LoyaltyModule, PaymentsModule],
  controllers: [SchedulingController, AdminSchedulingController, AppointmentsController],
  providers: [TimeService, ScheduleService, AppointmentService, BootstrapSchedulingService],
  exports: [TimeService],
})
export class SchedulingModule {}
