import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CompleteOnboardingDto {
  @IsOptional()
  @IsBoolean()
  requiresPayment?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mercadopagoAccessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mercadopagoNotifUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mercadopagoRedirectUrl?: string;

  @IsOptional()
  @IsBoolean()
  mercadopagoEnabled?: boolean;

  @IsOptional()
  @IsArray()
  mercadopagoExcludedPaymentMethods?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emailFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emailFromName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  smtpUser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  smtpPassword?: string;

  @IsOptional()
  @IsString()
  @IsIn(['tls', 'ssl', 'none'])
  smtpEncryption?: string;
}
