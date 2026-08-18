import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AuditService } from './audit.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { ChallengeService } from './challenge.service';
import { MessagingService } from './messaging.service';
import { PasswordService } from './password.service';
import { PendingRegistrationBootstrapService } from './pending-registration-bootstrap.service';
import { PendingRegistrationService } from './pending-registration.service';
import { PhoneService } from './phone.service';
import { RolesGuard } from './roles.guard';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController, AdminUsersController],
  providers: [
    PasswordService,
    PendingRegistrationBootstrapService,
    PendingRegistrationService,
    PhoneService,
    MessagingService,
    ChallengeService,
    SessionService,
    AuditService,
    AuthService,
    AdminUsersService,
    BootstrapAdminService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [
    SessionService,
    PasswordService,
    PhoneService,
    AuditService,
    MessagingService,
    PendingRegistrationService,
  ],
})
export class IdentityModule {}
