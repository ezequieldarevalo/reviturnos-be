import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('admin_action_logs')
@Index('IDX_admin_action_logs_plant_createdAt', ['plantId', 'createdAt'])
@Index('IDX_admin_action_logs_user_createdAt', ['userId', 'createdAt'])
export class AdminActionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  plantId: string | null;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 200 })
  userEmail: string;

  @Column({ length: 50 })
  userRole: string;

  @Column({ length: 100 })
  action: string;

  @Column({ length: 60 })
  targetType: string;

  @Column({ length: 120, nullable: true })
  targetId: string | null;

  @Column({ type: 'jsonb', default: {} })
  before: any;

  @Column({ type: 'jsonb', default: {} })
  after: any;

  @Column({ type: 'jsonb', default: {} })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}
