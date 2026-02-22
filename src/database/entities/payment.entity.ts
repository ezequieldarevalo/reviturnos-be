import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Appointment } from './appointment.entity';
import { PaymentStatus, AppointmentOrigin } from '@/common/constants';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  appointmentId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  paymentDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'ARS' })
  currency: string;

  @Column({ length: 50 })
  method: string;

  @Column({ length: 50, nullable: true })
  platform: string;

  @Column({ length: 200, nullable: true })
  transactionId: string;

  @Column({ length: 200, nullable: true })
  reference: string;

  @Column({ type: 'varchar', length: 50, default: PaymentStatus.APPROVED })
  status: PaymentStatus;

  @Column({ type: 'char', length: 1, nullable: true })
  origin: AppointmentOrigin;

  @Column({ length: 200, nullable: true })
  externalPaymentId: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;

  // Relations
  @ManyToOne(() => Appointment, (appointment) => appointment.payments)
  @JoinColumn({ name: 'appointmentId' })
  appointment: Appointment;
}
