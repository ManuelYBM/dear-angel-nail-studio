import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { AppointmentStatus, DepositStatus, UserRole } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class ReportRangeDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class AppointmentReportQueryDto extends ReportRangeDto {
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsString()
  technicianId?: string;
}

export class DepositReportQueryDto extends ReportRangeDto {
  @IsOptional()
  @IsEnum(DepositStatus)
  status?: DepositStatus;
}

export class ReportExportQueryDto extends ReportRangeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  technicianId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @IsOptional()
  @IsEnum(UserRole)
  actorRole?: UserRole;
}

export class AuditQueryDto extends ReportRangeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @IsOptional()
  @IsEnum(UserRole)
  actorRole?: UserRole;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  pageSize = 30;
}

export class StudioSettingsDto {
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  businessName!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(180)
  tagline!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(80)
  state!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(240)
  addressLine?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(40)
  publicPhone?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(40)
  whatsapp?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  instagramUrl?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  facebookUrl?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  tiktokUrl?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  websiteUrl?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  mapUrl?: string;
}
