import { IsString, IsNotEmpty } from 'class-validator';

export class GetQuotesDto {
  @IsString()
  @IsNotEmpty()
  tipoVehiculo: string;
}
