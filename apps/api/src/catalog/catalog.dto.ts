import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CalculatorOptionKind, CalculatorPricingMode, QuoteStatus } from '@prisma/client';

export class CatalogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  technique?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  favorites?: boolean;
}

export class PublicCatalogQueryDto extends CatalogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  limit?: number;
}

export class CatalogDesignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(1200)
  description!: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceCents!: number;

  @IsInt()
  @Min(15)
  @Max(720)
  durationMinutes!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  technique!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nailLength?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  categories!: string[];

  @IsBoolean()
  published!: boolean;

  @IsBoolean()
  featured!: boolean;

  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder!: number;
}

export class CalculatorOptionDto {
  @IsEnum(CalculatorOptionKind)
  kind!: CalculatorOptionKind;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  iconText?: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceCents!: number;

  @IsInt()
  @Min(0)
  @Max(720)
  durationMinutes!: number;

  @IsEnum(CalculatorPricingMode)
  pricingMode!: CalculatorPricingMode;

  @IsInt()
  @Min(1)
  @Max(20)
  maxQuantity!: number;

  @IsOptional()
  @IsUUID()
  parentOptionId?: string;

  @IsBoolean()
  active!: boolean;

  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder!: number;
}

export class QuoteSelectionDto {
  @IsUUID()
  optionId!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class CreateQuoteDto {
  @IsOptional()
  @IsUUID()
  preferredTechnicianId?: string;

  @IsBoolean()
  noDesign!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  clientNotes?: string;

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => QuoteSelectionDto)
  selections!: QuoteSelectionDto[];
}

export class ReviewQuoteDto {
  @IsEnum(QuoteStatus)
  status!: QuoteStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  confirmedPriceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(720)
  confirmedDurationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  reviewerComments?: string;
}

export class AssignQuoteDto {
  @IsUUID()
  technicianId!: string;
}
