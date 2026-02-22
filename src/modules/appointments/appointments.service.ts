import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import * as moment from 'moment';
import { Appointment } from '@/database/entities/appointment.entity';
import { AppointmentDetail } from '@/database/entities/appointment-detail.entity';
import { InspectionLine } from '@/database/entities/inspection-line.entity';
import { Pricing } from '@/database/entities/pricing.entity';
import { Plant } from '@/database/entities/plant.entity';
import { AppointmentStatus, AppointmentOrigin, ERROR_REASONS } from '@/common/constants';
import { PaymentsService } from '../payments/payments.service';
import { EmailService } from '../email/email.service';
import { AvailabilityService } from '../availability/availability.service';
import { ConfirmQuoteDto, ChangeDateDto, CancelQuoteDto } from './dto';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentsRepo: Repository<Appointment>,
    @InjectRepository(AppointmentDetail)
    private detailsRepo: Repository<AppointmentDetail>,
    @InjectRepository(InspectionLine)
    private linesRepo: Repository<InspectionLine>,
    @InjectRepository(Pricing)
    private pricingRepo: Repository<Pricing>,
    private paymentsService: PaymentsService,
    private emailService: EmailService,
    private availabilityService: AvailabilityService,
  ) {}

  async getAvailableQuotes(plant: Plant, vehicleType: string) {
    // 1. Validar que existe precio para ese tipo de vehículo
    const pricing = await this.pricingRepo.findOne({
      where: {
        plantId: plant.id,
        vehicleType,
        validFrom: LessThanOrEqual(new Date()),
      },
      order: { validFrom: 'DESC' },
    });

    if (!pricing) {
      throw new NotFoundException({ reason: ERROR_REASONS.INVALID_VEHICLE_TYPE });
    }

    // 2. Calcular rango de fechas
    const maxDays = plant.config?.business?.daysAvailableInAdvance || 30;
    const fromDate = moment().add(1, 'day').toDate();
    const toDate = moment().add(maxDays, 'days').toDate();

    // 3. Generar disponibilidad dinámica
    const availability = await this.availabilityService.getAvailableSlots(
      plant.id,
      vehicleType,
      fromDate,
      toDate,
    );

    // Filtrar solo slots disponibles
    const availableSlots = availability.slots.filter((slot) => slot.available);

    if (availableSlots.length === 0) {
      throw new NotFoundException({ reason: ERROR_REASONS.NO_AVAILABLE_QUOTES });
    }

    // 4. Formatear respuesta compatible con API anterior
    const turnos = availableSlots.map((slot) => ({
      id: null, // No existe ID hasta que se reserve
      fecha: slot.date,
      hora: slot.time,
      lineId: slot.lineId,
    }));

    return {
      status: 'success',
      tipo_vehiculo: vehicleType,
      precio: pricing.price,
      dias: availability.dates,
      turnos,
    };
  }

  async confirmQuote(plant: Plant, dto: ConfirmQuoteDto) {
    let appointment: Appointment;
    let createdDynamically = false;

    // 1. Si tiene id_turno, buscar turno existente (modo legacy)
    if (dto.id_turno) {
      appointment = await this.appointmentsRepo.findOne({
        where: { id: dto.id_turno, plantId: plant.id },
      });

      if (!appointment) {
        throw new NotFoundException({ reason: ERROR_REASONS.INEXISTENT_QUOTE });
      }

      const currentDate = new Date();
      const isReservedExpired =
        appointment.status === AppointmentStatus.RESERVED &&
        appointment.reservationExpiresAt < currentDate;

      if (appointment.status !== AppointmentStatus.AVAILABLE && !isReservedExpired) {
        throw new NotFoundException({ reason: ERROR_REASONS.RECENTLY_RESERVED_QUOTE });
      }
    }
    // 2. Si no tiene id_turno, crear turno dinámicamente
    else if (dto.fecha && dto.hora && dto.lineId) {
      // Verificar que el slot esté disponible
      const existingAppointment = await this.appointmentsRepo.findOne({
        where: {
          plantId: plant.id,
          lineId: dto.lineId,
          appointmentDate: dto.fecha,
          appointmentTime: dto.hora,
          status: In([AppointmentStatus.RESERVED, AppointmentStatus.CONFIRMED]),
        },
      });

      if (existingAppointment) {
        throw new BadRequestException({ reason: ERROR_REASONS.RECENTLY_RESERVED_QUOTE });
      }

      // Crear nuevo appointment
      appointment = this.appointmentsRepo.create({
        plantId: plant.id,
        lineId: dto.lineId,
        appointmentDate: dto.fecha,
        appointmentTime: dto.hora,
        status: AppointmentStatus.AVAILABLE,
        origin: dto.origen === 'A' ? AppointmentOrigin.ADMIN : AppointmentOrigin.WEB,
      });
      createdDynamically = true;
    } else {
      throw new BadRequestException({
        reason: 'Debe proporcionar id_turno o (fecha + hora + lineId)',
      });
    }

    const currentDate = new Date();

    // 3. Validar dominio no tiene turno pendiente (si aplica)
    if (plant.config?.payment?.validatePendingQuotes) {
      const existingDetails = await this.detailsRepo
        .createQueryBuilder('detail')
        .innerJoin('detail.appointment', 'appointment')
        .where('detail.vehicleDomain = :domain', { domain: dto.dominio })
        .andWhere('appointment.plantId = :plantId', { plantId: plant.id })
        .andWhere('appointment.status = :status', { status: AppointmentStatus.RESERVED })
        .andWhere('appointment.reservationExpiresAt > :now', { now: currentDate })
        .getOne();

      if (existingDetails) {
        throw new BadRequestException({ reason: ERROR_REASONS.DOMAIN_WITH_PENDING_QUOTE });
      }
    }

    // 4. Crear orden de pago si la planta requiere pago
    let paymentUrl = '';
    let expirationMinutes = 0;
    const paymentPlatform = (dto.plataforma_pago || '').toLowerCase();

    const requiresPayment = plant.config?.payment?.requiresPayment ?? true;

    if (createdDynamically) {
      appointment = await this.appointmentsRepo.save(appointment);
    }

    if (requiresPayment && paymentPlatform) {
      dto.plataforma_pago = paymentPlatform;
      let paymentResult: { payment_id: string; url_pago: string; reference: string };
      try {
        paymentResult = await this.paymentsService.createPaymentOrder(plant, appointment, dto);
      } catch (error) {
        if (createdDynamically) {
          await this.appointmentsRepo.delete({ id: appointment.id, plantId: plant.id });
        }
        throw error;
      }
      paymentUrl = paymentResult.url_pago;
      expirationMinutes = plant.config?.payment?.expirationMinutes || 120;

      // 5. Actualizar turno a Reservado
      appointment.status = AppointmentStatus.RESERVED;
      appointment.reservedAt = currentDate;
      appointment.reservationExpiresAt = moment().add(expirationMinutes, 'minutes').toDate();
      appointment.paymentId = paymentResult.payment_id;
      appointment.paymentPlatform = paymentPlatform;
    } else {
      // 6. Sin pago: Confirmar directo
      appointment.status = AppointmentStatus.CONFIRMED;
    }

    await this.appointmentsRepo.save(appointment);

    // 7. Guardar detalles del turno
    const details = this.detailsRepo.create({
      appointmentId: appointment.id,
      customerName: dto.nombre,
      customerEmail: dto.email,
      customerPhone: dto.telefono,
      vehicleDomain: dto.dominio,
      vehicleType: dto.tipo_vehiculo,
      vehicleYear: parseInt(dto.anio),
      vehicleFuel: dto.combustible,
    });

    await this.detailsRepo.save(details);

    // 8. Enviar email de confirmación
    await this.emailService.sendAppointmentEmail({
      plant,
      appointment,
      detail: details,
      type: 'confirmation',
      paymentUrl: paymentUrl || undefined,
    });

    return {
      url_pago: paymentUrl,
      minutos_para_pago: expirationMinutes,
      mensaje: 'success',
    };
  }

  async getQuotesForReschedule(plant: Plant, appointmentId: string) {
    // Obtener turno existente
    const appointment = await this.appointmentsRepo.findOne({
      where: { id: appointmentId, plantId: plant.id },
      relations: ['details'],
    });

    if (!appointment) {
      throw new NotFoundException({ reason: ERROR_REASONS.INEXISTENT_QUOTE });
    }

    const details = await this.detailsRepo.findOne({
      where: { appointmentId: appointment.id },
    });

    if (!details) {
      throw new NotFoundException({ reason: ERROR_REASONS.INEXISTENT_QUOTE });
    }

    // Obtener turnos disponibles para el mismo tipo de vehículo
    const availableQuotes = await this.getAvailableQuotes(plant, details.vehicleType);

    return {
      ...availableQuotes,
      fecha: appointment.appointmentDate,
      hora: appointment.appointmentTime,
    };
  }

  async getQuoteForCancel(plant: Plant, appointmentId: string) {
    const appointment = await this.appointmentsRepo.findOne({
      where: { id: appointmentId, plantId: plant.id },
    });

    if (!appointment) {
      throw new NotFoundException({ reason: ERROR_REASONS.INEXISTENT_QUOTE });
    }

    return {
      quote: {
        id: appointment.id,
        fecha: appointment.appointmentDate,
        hora: appointment.appointmentTime,
      },
    };
  }

  async changeDate(plant: Plant, dto: ChangeDateDto) {
    // Validar turno anterior
    const oldAppointment = await this.appointmentsRepo.findOne({
      where: { id: dto.id_turno_ant, plantId: plant.id },
      relations: ['details'],
    });

    if (!oldAppointment) {
      throw new NotFoundException({ reason: ERROR_REASONS.INEXISTENT_QUOTE });
    }

    const details = await this.detailsRepo.findOne({
      where: { appointmentId: oldAppointment.id },
    });

    if (!details || details.customerEmail !== dto.email) {
      throw new BadRequestException({ reason: ERROR_REASONS.INEXISTENT_QUOTE });
    }

    // Validar/crear nuevo turno
    let newAppointment: Appointment | null = null;

    if (dto.id_turno_nuevo) {
      newAppointment = await this.appointmentsRepo.findOne({
        where: { id: dto.id_turno_nuevo, plantId: plant.id },
      });

      if (!newAppointment || newAppointment.status !== AppointmentStatus.AVAILABLE) {
        throw new NotFoundException({ reason: ERROR_REASONS.INEXISTENT_QUOTE });
      }
    } else if (dto.fecha && dto.hora && dto.lineId) {
      const existingSlot = await this.appointmentsRepo.findOne({
        where: {
          plantId: plant.id,
          lineId: dto.lineId,
          appointmentDate: dto.fecha,
          appointmentTime: dto.hora,
        },
      });

      if (existingSlot && existingSlot.status !== AppointmentStatus.AVAILABLE) {
        throw new BadRequestException({ reason: ERROR_REASONS.RECENTLY_RESERVED_QUOTE });
      }

      newAppointment =
        existingSlot ||
        this.appointmentsRepo.create({
          plantId: plant.id,
          lineId: dto.lineId,
          appointmentDate: dto.fecha,
          appointmentTime: dto.hora,
          status: AppointmentStatus.AVAILABLE,
          origin: oldAppointment.origin || AppointmentOrigin.WEB,
        });

      await this.appointmentsRepo.save(newAppointment);
    } else {
      throw new BadRequestException({
        reason: 'Debe proporcionar id_turno_nuevo o (fecha + hora + lineId)',
      });
    }

    // Liberar turno anterior
    oldAppointment.status = AppointmentStatus.AVAILABLE;
    oldAppointment.reservedAt = null;
    oldAppointment.reservationExpiresAt = null;
    oldAppointment.paymentId = null;
    await this.appointmentsRepo.save(oldAppointment);

    // Asignar nuevo turno
    newAppointment.status = oldAppointment.paymentPlatform
      ? AppointmentStatus.RESERVED
      : AppointmentStatus.CONFIRMED;
    newAppointment.paymentId = oldAppointment.paymentId;
    newAppointment.paymentPlatform = oldAppointment.paymentPlatform;
    await this.appointmentsRepo.save(newAppointment);

    // Mover detalles al nuevo turno
    details.appointmentId = newAppointment.id;
    await this.detailsRepo.save(details);

    // Enviar email de reprogramación
    await this.emailService.sendAppointmentEmail({
      plant,
      appointment: newAppointment,
      detail: details,
      type: 'reschedule',
    });

    return { done: true };
  }

  async cancelQuote(plant: Plant, dto: CancelQuoteDto) {
    const appointment = await this.appointmentsRepo.findOne({
      where: { id: dto.id_turno, plantId: plant.id },
    });

    if (!appointment) {
      throw new NotFoundException({ reason: ERROR_REASONS.INEXISTENT_QUOTE });
    }

    const details = await this.detailsRepo.findOne({
      where: { appointmentId: appointment.id },
    });

    if (!details || details.customerEmail !== dto.email) {
      throw new BadRequestException({ reason: ERROR_REASONS.INEXISTENT_QUOTE });
    }

    // Cancelar turno
    appointment.status = AppointmentStatus.CANCELLED;
    await this.appointmentsRepo.save(appointment);

    // Enviar email de cancelación
    await this.emailService.sendAppointmentEmail({
      plant,
      appointment,
      detail: details,
      type: 'cancellation',
    });

    return { done: true };
  }
}
