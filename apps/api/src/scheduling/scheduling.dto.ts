import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

export class WorkingPeriodDto {
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class DayPeriodDto {
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class WeeklyScheduleDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => WorkingPeriodDto)
  periods!: WorkingPeriodDto[];
}

export class DayOverrideDto {
  @IsBoolean()
  isClosed!: boolean;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => DayPeriodDto)
  periods!: DayPeriodDto[];
}

export class BookingAvailabilityDto {
  @IsBoolean()
  acceptingBookings!: boolean;
}

export class BookingPolicyDto {
  @IsInt()
  @Min(15)
  @Max(720)
  defaultDurationMinutes!: number;

  @IsInt()
  @Min(15)
  @Max(180)
  slotIntervalMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(10_080)
  minimumLeadMinutes!: number;

  @IsInt()
  @Min(1)
  @Max(365)
  maximumAdvanceDays!: number;

  @IsInt()
  @Min(1)
  @Max(60)
  holdMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(720)
  rescheduleNoticeHours!: number;

  @IsInt()
  @Min(0)
  @Max(10)
  clientRescheduleLimit!: number;
}

export class AvailabilityQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(720)
  durationMinutes?: number;
}

export class CreateHoldDto {
  @IsDateString()
  startAt!: string;

  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsUUID()
  catalogDesignId?: string;

  @IsOptional()
  @IsUUID()
  customQuoteId?: string;
}

export class CreateManualAppointmentDto {
  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  clientPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guestName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  guestPhone?: string;

  @IsDateString()
  startAt!: string;

  @IsInt()
  @Min(15)
  @Max(720)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RescheduleAppointmentDto {
  @IsDateString()
  startAt!: string;

  @IsOptional()
  @IsUUID()
  technicianId?: string;
}

export class UpdateAppointmentStatusDto {
  @IsIn([AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW])
  status!: AppointmentStatus;
}

export class AppointmentListQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
