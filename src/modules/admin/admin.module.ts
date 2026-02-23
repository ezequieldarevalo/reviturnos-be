import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '@/database/entities/appointment.entity';
import { AppointmentDetail } from '@/database/entities/appointment-detail.entity';
import { InspectionLine } from '@/database/entities/inspection-line.entity';
import { Payment } from '@/database/entities/payment.entity';
import { Pricing } from '@/database/entities/pricing.entity';
import { Plant } from '@/database/entities/plant.entity';
import { User } from '@/database/entities/user.entity';
import { AdminActionLog } from '@/database/entities/admin-action-log.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      AppointmentDetail,
      InspectionLine,
      Payment,
      Pricing,
      Plant,
      User,
      AdminActionLog,
    ]),
    EmailModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
