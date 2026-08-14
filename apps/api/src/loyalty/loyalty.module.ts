import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AdminLoyaltyController, LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { BootstrapLoyaltyService } from './bootstrap-loyalty.service';

@Module({
  imports: [IdentityModule],
  controllers: [LoyaltyController, AdminLoyaltyController],
  providers: [LoyaltyService, BootstrapLoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
