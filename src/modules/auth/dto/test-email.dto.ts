import { IsEmail, IsOptional, MaxLength } from 'class-validator';

export class TestEmailDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  to?: string;
}
