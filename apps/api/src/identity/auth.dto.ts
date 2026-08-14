import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Sex } from '@prisma/client';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterClientDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsEnum(Sex)
  sex!: Sex;

  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128)
  @Matches(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/, { message: 'La contraseña debe incluir una letra.' })
  @Matches(/\d/, { message: 'La contraseña debe incluir un número.' })
  password!: string;

  @IsString()
  passwordConfirmation!: string;

  @Equals(true, { message: 'Debes confirmar el aviso para menores de edad.' })
  acceptedMinorNotice!: boolean;
}

export class VerifyCodeDto {
  @IsUUID()
  challengeId!: string;

  @Transform(trim)
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ResendVerificationDto {
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone!: string;
}

export class LoginDto {
  @Transform(trim)
  @IsString()
  @MaxLength(254)
  identifier!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class ForgotPasswordDto {
  @Transform(trim)
  @IsString()
  @MaxLength(254)
  identifier!: string;
}

export class ResetPasswordDto extends VerifyCodeDto {
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128)
  @Matches(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/, { message: 'La contraseña debe incluir una letra.' })
  @Matches(/\d/, { message: 'La contraseña debe incluir un número.' })
  password!: string;

  @IsString()
  passwordConfirmation!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128)
  @Matches(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/, { message: 'La contraseña debe incluir una letra.' })
  @Matches(/\d/, { message: 'La contraseña debe incluir un número.' })
  newPassword!: string;

  @IsString()
  passwordConfirmation!: string;
}

export class UpdateOwnProfileDto {
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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MaxLength(128)
  currentPassword!: string;
}
