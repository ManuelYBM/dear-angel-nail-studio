import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RewardRuleDto {
  @IsInt()
  @Min(1)
  @Max(10_000)
  visitNumber!: number;

  @Transform(trimmed)
  @IsString()
  @Length(2, 80)
  title!: string;

  @Transform(trimmed)
  @IsString()
  @Length(2, 500)
  description!: string;

  @Transform(trimmed)
  @IsString()
  @Length(1, 12)
  iconText!: string;

  @IsBoolean()
  active!: boolean;
}

export class PromotionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,30}$/)
  code!: string;

  @Transform(trimmed)
  @IsString()
  @Length(2, 80)
  title!: string;

  @Transform(trimmed)
  @IsString()
  @Length(2, 500)
  description!: string;

  @Transform(trimmed)
  @IsString()
  @Length(1, 12)
  iconText!: string;

  @IsBoolean()
  active!: boolean;
}

export class VisitCorrectionDto {
  @IsInt()
  @Min(0)
  @Max(100_000)
  visitCount!: number;

  @Transform(trimmed)
  @IsString()
  @Length(3, 300)
  note!: string;
}

export class IssuePromotionDto {
  @IsUUID()
  clientId!: string;
}

export class RedeemCouponDto {
  @IsUUID()
  appointmentId!: string;
}

export class ClientSearchDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(1, 100)
  search?: string;
}
