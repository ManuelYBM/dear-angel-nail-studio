import { Global, Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { CalendarController, IntegrationStatusController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { AdminNotificationsController, NotificationsController } from './notifications.controller';
import { NotificationsBootstrapService } from './notifications-bootstrap.service';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  imports: [IdentityModule],
  controllers: [
    NotificationsController,
    AdminNotificationsController,
    CalendarController,
    IntegrationStatusController,
  ],
  providers: [NotificationsService, NotificationsBootstrapService, CalendarService],
  exports: [NotificationsService, CalendarService],
})
export class NotificationsModule {}
