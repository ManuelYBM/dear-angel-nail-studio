import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { Roles } from '../common/auth.decorators';
import { ScheduleService } from './schedule.service';
import {
  BookingAvailabilityDto,
  BookingPolicyDto,
  DayOverrideDto,
  WeeklyScheduleDto,
} from './scheduling.dto';

@Controller('admin/scheduling')
@Roles(UserRole.ADMIN)
export class AdminSchedulingController {
  constructor(private readonly schedules: ScheduleService) {}

  @Get()
  overview() {
    return this.schedules.getGlobalConfiguration();
  }

  @Put('global')
  updateGlobal(@Body() dto: WeeklyScheduleDto) {
    return this.schedules.updateGlobal(dto.periods);
  }

  @Put('policy')
  updatePolicy(@Body() dto: BookingPolicyDto) {
    return this.schedules.updatePolicy(dto);
  }

  @Get('technicians/:id')
  technician(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedules.getTechnicianSchedule(id);
  }

  @Put('technicians/:id/weekly')
  updateTechnicianWeekly(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WeeklyScheduleDto) {
    return this.schedules.updateWeekly(id, dto.periods);
  }

  @Post('technicians/:id/use-global')
  useGlobal(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedules.useGlobalSchedule(id);
  }

  @Patch('technicians/:id/accepting')
  setAccepting(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BookingAvailabilityDto) {
    return this.schedules.setAcceptingBookings(id, dto.acceptingBookings);
  }

  @Put('technicians/:id/overrides/:date')
  setOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @Body() dto: DayOverrideDto,
  ) {
    return this.schedules.setOverride(id, date, dto.isClosed, dto.periods);
  }

  @Delete('technicians/:id/overrides/:date')
  removeOverride(@Param('id', ParseUUIDPipe) id: string, @Param('date') date: string) {
    return this.schedules.removeOverride(id, date);
  }
}
