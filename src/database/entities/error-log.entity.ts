import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('error_logs')
export class ErrorLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  plantId: string;

  @Column({ type: 'int', nullable: true })
  appointmentId: number;

  @Column({ length: 100 })
  errorType: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  fixApplied: string;

  @Column({ length: 100, nullable: true })
  service: string;

  @Column({ length: 100, nullable: true })
  rtoAppointmentNumber: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}
