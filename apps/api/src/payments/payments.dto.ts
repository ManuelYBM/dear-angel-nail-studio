import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PaymentSettingsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  amountCents!: number;

  @Transform(trimmed)
  @IsString()
  @Length(2, 120)
  recipientName!: string;

  @Transform(trimmed)
  @IsString()
  @Length(2, 80)
  bankName!: string;

  @Transform(trimmed)
  @Matches(/^\d{18}$/)
  clabe!: string;

  @IsOptional()
  @Transform(trimmed)
  @Matches(/^\d{4,20}$/)
  accountNumber?: string;

  @Transform(trimmed)
  @IsString()
  @Length(2, 500)
  transferNotes!: string;

  @Transform(trimmed)
  @IsString()
  @Length(1, 40)
  policyVersion!: string;

  @Transform(trimmed)
  @IsString()
  @Length(20, 2_000)
  policyText!: string;
}

export class ReceiptAcceptanceDto {
  @Transform(trimmed)
  @IsString()
  @Length(1, 40)
  policyVersion!: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  policiesAccepted!: boolean;
}

export class ReviewDepositDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class DepositListQueryDto {
  @IsOptional()
  @IsIn(['AWAITING_RECEIPT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'])
  status?:
    'AWAITING_RECEIPT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
}
