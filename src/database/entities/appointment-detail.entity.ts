import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Appointment } from './appointment.entity';

@Entity('appointment_details')
export class AppointmentDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  appointmentId: string;

  @Column({ length: 200 })
  customerName: string;

  @Column({ length: 200 })
  customerEmail: string;

  @Column({ length: 50, nullable: true })
  customerPhone: string;

  @Column({ length: 20 })
  vehicleDomain: string;

  @Column({ length: 50, nullable: true })
  vehicleType: string;

  @Column({ length: 100, nullable: true })
  vehicleBrand: string;

  @Column({ length: 100, nullable: true })
  vehicleModel: string;

  @Column({ type: 'int', nullable: true })
  vehicleYear: number;

  @Column({ length: 50, nullable: true })
  vehicleFuel: string;

  @Column({ default: false })
  registeredInMendoza: boolean;

  @Column({ length: 100, nullable: true })
  rtoAppointmentNumber: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToOne(() => Appointment, (appointment) => appointment.details)
  @JoinColumn({ name: 'appointmentId' })
  appointment: Appointment;
}
