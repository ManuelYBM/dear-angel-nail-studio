import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';

import { CurrentUser, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/auth.types';
import { AppointmentService } from './appointment.service';
import {
  AppointmentListQueryDto,
  CreateHoldDto,
  CreateManualAppointmentDto,
  RescheduleAppointmentDto,
  UpdateAppointmentStatusDto,
} from './scheduling.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AppointmentListQueryDto) {
    return this.appointments.list(user, query);
  }

  @Roles(UserRole.CLIENT)
  @Post('hold')
  hold(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateHoldDto,
    @Req() request: Request,
  ) {
    return this.appointments.createHold(user, dto, request);
  }

  @Roles(UserRole.ADMIN, UserRole.NAIL_TECHNICIAN)
  @Post('manual')
  createManual(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateManualAppointmentDto,
    @Req() request: Request,
  ) {
    return this.appointments.createManual(user, dto, request);
  }

  @Patch(':id/reschedule')
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleAppointmentDto,
    @Req() request: Request,
  ) {
    return this.appointments.reschedule(user, id, dto, request);
  }

  @Patch(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.appointments.cancel(user, id, request);
  }

  @Roles(UserRole.ADMIN, UserRole.NAIL_TECHNICIAN)
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentStatusDto,
    @Req() request: Request,
  ) {
    return this.appointments.updateStatus(user, id, dto.status, request);
  }
}
