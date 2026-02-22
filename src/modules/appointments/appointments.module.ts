import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '@/database/entities/appointment.entity';
import { AppointmentDetail } from '@/database/entities/appointment-detail.entity';
import { InspectionLine } from '@/database/entities/inspection-line.entity';
import { Pricing } from '@/database/entities/pricing.entity';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { PaymentsModule } from '../payments/payments.module';
import { EmailModule } from '../email/email.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      AppointmentDetail,
      InspectionLine,
      Pricing,
    ]),
    PaymentsModule,
    EmailModule,
    AvailabilityModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
