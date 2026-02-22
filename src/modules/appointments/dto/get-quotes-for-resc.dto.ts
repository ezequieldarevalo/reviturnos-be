import { IsString, IsUUID } from 'class-validator';

export class GetQuotesForRescDto {
  @IsString()
  @IsUUID()
  id_turno: string;
}
