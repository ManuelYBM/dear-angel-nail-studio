import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Sex, UserRole, UserStatus } from '@prisma/client';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class CreateUserDto {
  @IsIn([UserRole.CLIENT, UserRole.NAIL_TECHNICIAN])
  role!: UserRole;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/)
  @Matches(/\d/)
  temporaryPassword?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email?: string | null;
}

export class UpdateUserStatusDto {
  @IsIn([UserStatus.ACTIVE, UserStatus.PAUSED, UserStatus.ARCHIVED])
  status!: UserStatus;
}
