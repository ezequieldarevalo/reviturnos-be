import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Plant } from './plant.entity';
import { Appointment } from './appointment.entity';

@Entity('inspection_lines')
export class InspectionLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  plantId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50 })
  vehicleType: string;

  @Column({ type: 'int', default: 4 })
  maxAppointmentsPerHour: number;

  @Column({ type: 'int', nullable: true })
  maxAppointmentsPerHourSecondary: number;

  @Column({ type: 'int', default: 30 })
  maxDaysAvailable: number;

  @Column({ type: 'jsonb', nullable: true })
  timeSlots: any;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Plant, (plant) => plant.inspectionLines)
  @JoinColumn({ name: 'plantId' })
  plant: Plant;

  @OneToMany(() => Appointment, (appointment) => appointment.line)
  appointments: Appointment[];
}
