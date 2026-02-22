import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { Appointment } from './appointment.entity';
import { InspectionLine } from './inspection-line.entity';
import { Pricing } from './pricing.entity';

@Entity('plants')
export class Plant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ unique: true, length: 100 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number;

  @Column({ default: true })
  active: boolean;

  // Configuración dinámica
  @Column({ type: 'jsonb', default: {} })
  config: PlantConfig;

  // MercadoPago credentials
  @Column({ type: 'text', nullable: true })
  mpToken: string;

  @Column({ type: 'text', nullable: true })
  mpNotifUrl: string;

  @Column({ type: 'text', nullable: true })
  mpRedirectUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  mpExcludedPaymentMethods: any;

  @Column({ type: 'jsonb', nullable: true })
  mpCashExcludedPaymentMethods: any;

  // RTO credentials
  @Column({ type: 'text', nullable: true })
  rtoUrl: string;

  @Column({ type: 'text', nullable: true })
  rtoUser: string;

  @Column({ type: 'text', nullable: true })
  rtoPassword: string;

  // Email config
  @Column({ length: 200, nullable: true })
  emailFrom: string;

  @Column({ length: 200, nullable: true })
  emailFromName: string;

  @Column({ length: 200, nullable: true })
  smtpHost: string;

  @Column({ nullable: true, default: 587 })
  smtpPort: number;

  @Column({ length: 200, nullable: true })
  smtpUser: string;

  @Column({ type: 'text', nullable: true })
  smtpPassword: string;

  @Column({ length: 10, nullable: true, default: 'tls' })
  smtpEncryption: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => User, (user) => user.plant)
  users: User[];

  @OneToMany(() => Appointment, (appointment) => appointment.plant)
  appointments: Appointment[];

  @OneToMany(() => InspectionLine, (line) => line.plant)
  inspectionLines: InspectionLine[];

  @OneToMany(() => Pricing, (pricing) => pricing.plant)
  pricing: Pricing[];
}

export interface DaySchedule {
  from: string; // "08:00"
  to: string; // "17:00"
  slotsPerHour: number; // 4 = cada 15min, 2 = cada 30min, etc
}

export interface PlantConfig {
  // Horarios por día de la semana
  schedules?: {
    monday?: DaySchedule;
    tuesday?: DaySchedule;
    wednesday?: DaySchedule;
    thursday?: DaySchedule;
    friday?: DaySchedule;
    saturday?: DaySchedule;
    sunday?: DaySchedule;
  };
  // Feriados (no se generan turnos)
  holidays?: string[]; // ["2026-01-01", "2026-05-01"]
  // Días no laborables (número de día de la semana: 0=domingo, 6=sábado)
  nonWorkingDays?: number[]; // [0, 6] = no trabaja dom/sab
  // Días especiales (ej: lunes con horario reducido)
  specialDays?: {
    [date: string]: DaySchedule; // "2026-01-20": { from: "09:00", to: "13:00", slotsPerHour: 2 }
  };
  payment?: {
    expirationMinutes?: number;
    cashExpirationMinutes?: number;
    marginPostCashPaymentMinutes?: number;
    validatePendingQuotes?: boolean;
    requiresPayment?: boolean;
  };
  business?: {
    ignoreVehicleLines?: boolean;
    daysAvailableInAdvance?: number; // Días a futuro disponibles (ej: 30)
  };
  integrations?: {
    mercadopago?: {
      enabled: boolean;
      excludedPaymentMethods?: string[]; // ['rapipago', 'pagofacil']
    };
    rto?: { enabled: boolean; confirmQuotes: boolean };
  };
}
