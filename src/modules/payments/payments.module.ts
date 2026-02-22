import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '@/database/entities/payment.entity';
import { Appointment } from '@/database/entities/appointment.entity';
import { AppointmentDetail } from '@/database/entities/appointment-detail.entity';
import { Plant } from '@/database/entities/plant.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Appointment, AppointmentDetail, Plant]),
    EmailModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
