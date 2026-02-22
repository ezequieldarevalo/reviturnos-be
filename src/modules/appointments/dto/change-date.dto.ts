import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChangeDateDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  id_turno_nuevo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  fecha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  hora?: string;

  @IsOptional()
  @IsString()
  lineId?: string;

  @IsString()
  @IsUUID()
  id_turno_ant: string;
}
