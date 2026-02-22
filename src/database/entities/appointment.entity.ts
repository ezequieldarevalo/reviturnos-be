import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
  Generated,
  Index,
} from 'typeorm';
import { Plant } from './plant.entity';
import { InspectionLine } from './inspection-line.entity';
import { AppointmentDetail } from './appointment-detail.entity';
import { Payment } from './payment.entity';
import { AppointmentStatus, AppointmentOrigin } from '@/common/constants';

@Entity('appointments')
@Index('UQ_appointments_plant_plant_appointment_number', ['plantId', 'plantAppointmentNumber'], {
  unique: true,
})
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint', unique: true })
  @Generated('increment')
  appointmentNumber: number;

  @Column({ type: 'bigint', nullable: true })
  plantAppointmentNumber: number;

  @Column({ type: 'uuid' })
  plantId: string;

  @Column({ type: 'uuid', nullable: true })
  lineId: string;

  @Column({ type: 'date' })
  appointmentDate: string;

  @Column({ type: 'time' })
  appointmentTime: string;

  @Column({ type: 'char', length: 1, default: AppointmentStatus.AVAILABLE })
  status: AppointmentStatus;

  @Column({ type: 'char', length: 1, default: AppointmentOrigin.WEB })
  origin: AppointmentOrigin;

  @Column({ type: 'timestamp', nullable: true })
  reservedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  reservationExpiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date; // vencimiento del turno reservado

  // Campos de migración (mantener referencia con sistema viejo)
  @Column({ type: 'bigint', nullable: true })
  legacyTurnoId: number;

  @Column({ length: 20, nullable: true })
  legacyPlant: string; // 'lasheras', 'maipu', 'godoycruz'

  @Column({ length: 200, nullable: true })
  paymentId: string;

  @Column({ length: 50, nullable: true })
  paymentPlatform: string;

  @Column({ length: 100, nullable: true })
  rtoAppointmentNumber: string;

  @Column({ type: 'text', nullable: true })
  observations: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Plant, (plant) => plant.appointments)
  @JoinColumn({ name: 'plantId' })
  plant: Plant;

  @ManyToOne(() => InspectionLine, (line) => line.appointments)
  @JoinColumn({ name: 'lineId' })
  line: InspectionLine;

  @OneToOne(() => AppointmentDetail, (detail) => detail.appointment)
  details: AppointmentDetail;

  @OneToMany(() => Payment, (payment) => payment.appointment)
  payments: Payment[];
}
