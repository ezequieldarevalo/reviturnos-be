import { IsString, IsEmail, MaxLength, IsOptional, IsUUID } from 'class-validator';

export class ConfirmQuoteDto {
  @IsString()
  @MaxLength(1)
  origen: string; // 'T' = Turnos (Web), 'A' = Admin

  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsString()
  @MaxLength(20)
  dominio: string;

  @IsString()
  @MaxLength(20)
  anio: string;

  @IsString()
  @MaxLength(20)
  telefono: string;

  @IsString()
  @MaxLength(20)
  combustible: string;

  @IsOptional()
  @IsUUID()
  id_turno?: string; // Opcional cuando se genera dinámicamente

  @IsString()
  @MaxLength(10)
  fecha?: string; // "2026-01-15" - Requerido si no hay id_turno

  @IsString()
  @MaxLength(5)
  hora?: string; // "14:30" - Requerido si no hay id_turno

  @IsString()
  lineId?: string; // Requerido si no hay id_turno

  @IsString()
  @MaxLength(50)
  tipo_vehiculo: string;

  @IsString()
  @MaxLength(20)
  plataforma_pago: string; // 'mercadopago', 'efectivo', or ''
}
