import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class NotificationListDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  take = 50;
}

export class UpdateNotificationTemplateDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsString()
  @MaxLength(160)
  titleTemplate!: string;

  @IsString()
  @MaxLength(600)
  bodyTemplate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  whatsappTemplateName?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
