import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CurrentUser, Public, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/auth.types';
import { ScheduleService } from './schedule.service';
import {
  AvailabilityQueryDto,
  BookingAvailabilityDto,
  DayOverrideDto,
  WeeklyScheduleDto,
} from './scheduling.dto';
import { AppointmentService } from './appointment.service';

@Controller('scheduling')
export class SchedulingController {
  constructor(
    private readonly schedules: ScheduleService,
    private readonly appointments: AppointmentService,
  ) {}

  @Public()
  @Get('policy')
  getPolicy() {
    return this.schedules.getPolicy();
  }

  @Public()
  @Get('technicians')
  listTechnicians() {
    return this.schedules.listTechnicians();
  }

  @Public()
  @Get('availability')
  availability(@Query() query: AvailabilityQueryDto) {
    return this.appointments.availability(query);
  }

  @Roles(UserRole.NAIL_TECHNICIAN)
  @Get('my')
  mySchedule(@CurrentUser() user: AuthenticatedUser) {
    return this.schedules.getTechnicianSchedule(user.id);
  }

  @Roles(UserRole.NAIL_TECHNICIAN)
  @Put('my/weekly')
  updateMyWeekly(@CurrentUser() user: AuthenticatedUser, @Body() dto: WeeklyScheduleDto) {
    return this.schedules.updateWeekly(user.id, dto.periods);
  }

  @Roles(UserRole.NAIL_TECHNICIAN)
  @Post('my/use-global')
  useGlobal(@CurrentUser() user: AuthenticatedUser) {
    return this.schedules.useGlobalSchedule(user.id);
  }

  @Roles(UserRole.NAIL_TECHNICIAN)
  @Patch('my/accepting')
  setAccepting(@CurrentUser() user: AuthenticatedUser, @Body() dto: BookingAvailabilityDto) {
    return this.schedules.setAcceptingBookings(user.id, dto.acceptingBookings);
  }

  @Roles(UserRole.NAIL_TECHNICIAN)
  @Put('my/overrides/:date')
  setOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date') date: string,
    @Body() dto: DayOverrideDto,
  ) {
    return this.schedules.setOverride(user.id, date, dto.isClosed, dto.periods);
  }

  @Roles(UserRole.NAIL_TECHNICIAN)
  @Delete('my/overrides/:date')
  removeOverride(@CurrentUser() user: AuthenticatedUser, @Param('date') date: string) {
    return this.schedules.removeOverride(user.id, date);
  }
}
