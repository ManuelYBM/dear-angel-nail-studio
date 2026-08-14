import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { BootstrapPaymentsService } from './bootstrap-payments.service';
import { AdminPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [IdentityModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService, BootstrapPaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
