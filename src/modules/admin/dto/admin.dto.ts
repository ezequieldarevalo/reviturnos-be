import {
  IsString,
  IsInt,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsArray,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsDateString()
  @IsNotEmpty()
  fecha: string; // YYYY-MM-DD

  @IsString()
  @IsNotEmpty()
  hora: string; // HH:mm

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  dominio: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  apellido: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  telefono: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tipo_vehiculo: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  combustible?: string;

  @IsInt()
  @IsOptional()
  linea?: number;
}

export class RegisterPaymentDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  turno_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  metodo: string; // 'efectivo', 'mercadopago', 'transferencia'

  @IsString()
  @IsOptional()
  @MaxLength(200)
  referencia?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  transaction_id?: string;
}

export class RescheduleAppointmentDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  turno_id: string;

  @IsDateString()
  @IsNotEmpty()
  nueva_fecha: string; // YYYY-MM-DD

  @IsString()
  @IsNotEmpty()
  nueva_hora: string; // HH:mm

  @IsInt()
  @IsOptional()
  nueva_linea?: number;
}

export class GetAppointmentDataDto {
  @IsNotEmpty()
  @IsString()
  id_turno: string;
}

export class MarkAppointmentCompletedDto {
  @IsNotEmpty()
  @IsString()
  id_turno: string;
}

export class UpdateMercadoPagoConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notifUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  redirectUrl?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  excludedPaymentMethods?: string[];
}
