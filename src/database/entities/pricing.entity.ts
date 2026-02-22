import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Plant } from './plant.entity';

@Entity('pricing')
export class Pricing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  plantId: string;

  @Column({ length: 50 })
  vehicleType: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ length: 3, default: 'ARS' })
  currency: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  validFrom: Date;

  @Column({ type: 'date', nullable: true })
  validTo: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Plant, (plant) => plant.pricing)
  @JoinColumn({ name: 'plantId' })
  plant: Plant;
}
