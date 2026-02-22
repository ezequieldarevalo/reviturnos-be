import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TestMercadoPagoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessToken?: string;
}
