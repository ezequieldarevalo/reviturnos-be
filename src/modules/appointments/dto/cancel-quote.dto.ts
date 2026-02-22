import { IsEmail, IsString, IsUUID } from 'class-validator';

export class CancelQuoteDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsUUID()
  id_turno: string;
}
