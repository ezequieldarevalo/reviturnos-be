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
import { UserRole } from '@/common/constants';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  plantId: string;

  @Column({ unique: true, length: 200 })
  email: string;

  @Column({ type: 'text' })
  passwordHash: string;

  @Column({ length: 200, nullable: true })
  name: string;

  @Column({ type: 'varchar', length: 50, default: UserRole.OPERATOR })
  role: UserRole;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Plant, (plant) => plant.users)
  @JoinColumn({ name: 'plantId' })
  plant: Plant;
}
