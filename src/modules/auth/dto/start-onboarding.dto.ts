import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class StartOnboardingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  plantName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]{3,30}$/)
  plantCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  adminName: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(200)
  adminEmail: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  adminPassword: string;
}
