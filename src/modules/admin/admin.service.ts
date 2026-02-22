import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as moment from 'moment';
import { ConfigService } from '@nestjs/config';
import { Appointment } from '@/database/entities/appointment.entity';
import { AppointmentDetail } from '@/database/entities/appointment-detail.entity';
import { Payment } from '@/database/entities/payment.entity';
import { Plant } from '@/database/entities/plant.entity';
import { Pricing } from '@/database/entities/pricing.entity';
import { User } from '@/database/entities/user.entity';
import { AppointmentStatus, AppointmentOrigin, PaymentStatus, UserRole } from '@/common/constants';
import { EmailService } from '../email/email.service';
import {
  CreateAppointmentDto,
  RegisterPaymentDto,
  RescheduleAppointmentDto,
  UpdateMercadoPagoConfigDto,
} from './dto/admin.dto';
import { encryptSecret, maskSecret } from '@/common/utils/secret-crypto.util';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentsRepo: Repository<Appointment>,
    @InjectRepository(AppointmentDetail)
    private detailsRepo: Repository<AppointmentDetail>,
    @InjectRepository(Payment)
    private paymentsRepo: Repository<Payment>,
    @InjectRepository(Pricing)
    private pricingRepo: Repository<Pricing>,
    @InjectRepository(Plant)
    private plantsRepo: Repository<Plant>,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  private assertPlantAdmin(plant: Plant, user: User) {
    if (!user || !user.active) {
      throw new ForbiddenException('Usuario no autorizado');
    }
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Permisos insuficientes');
    }
    if (user.plantId !== plant.id) {
      throw new ForbiddenException('Usuario sin acceso a esta planta');
    }
  }

  async getMercadoPagoConfig(plant: Plant, user: User) {
    this.assertPlantAdmin(plant, user);

    const currentPlant = await this.plantsRepo.findOne({ where: { id: plant.id } });
    if (!currentPlant) {
      throw new NotFoundException('Planta no encontrada');
    }

    const enabled = currentPlant.config?.integrations?.mercadopago?.enabled ?? false;
    const excludedPaymentMethods =
      currentPlant.config?.integrations?.mercadopago?.excludedPaymentMethods || [];

    return {
      configured: !!currentPlant.mpToken,
      tokenMasked: maskSecret(currentPlant.mpToken),
      notifUrl: currentPlant.mpNotifUrl || null,
      redirectUrl: currentPlant.mpRedirectUrl || null,
      enabled,
      excludedPaymentMethods,
      updatedAt: currentPlant.updatedAt,
    };
  }

  async updateMercadoPagoConfig(plant: Plant, user: User, dto: UpdateMercadoPagoConfigDto) {
    this.assertPlantAdmin(plant, user);

    const currentPlant = await this.plantsRepo.findOne({ where: { id: plant.id } });
    if (!currentPlant) {
      throw new NotFoundException('Planta no encontrada');
    }

    if (dto.accessToken) {
      const encryptionKey =
        this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY') ||
        this.configService.get<string>('JWT_SECRET');
      if (!encryptionKey) {
        throw new BadRequestException('Encryption key is not configured');
      }
      currentPlant.mpToken = encryptSecret(dto.accessToken.trim(), encryptionKey);
    }

    if (dto.notifUrl !== undefined) {
      currentPlant.mpNotifUrl = dto.notifUrl?.trim();
    }

    if (dto.redirectUrl !== undefined) {
      currentPlant.mpRedirectUrl = dto.redirectUrl?.trim();
    }

    const cfg = currentPlant.config || {};
    cfg.integrations = cfg.integrations || {};
    cfg.integrations.mercadopago = cfg.integrations.mercadopago || { enabled: false };

    if (dto.enabled !== undefined) {
      cfg.integrations.mercadopago.enabled = dto.enabled;
    }

    if (dto.excludedPaymentMethods !== undefined) {
      cfg.integrations.mercadopago.excludedPaymentMethods = dto.excludedPaymentMethods;
    }

    currentPlant.config = cfg;
    await this.plantsRepo.save(currentPlant);

    return {
      success: true,
      message: 'Configuración de MercadoPago actualizada',
      configured: !!currentPlant.mpToken,
      tokenMasked: maskSecret(currentPlant.mpToken),
      enabled: currentPlant.config?.integrations?.mercadopago?.enabled ?? false,
    };
  }

  async getTurnosDiaActual(plant: Plant) {
    const currentDate = moment().subtract(3, 'hours').format('YYYY-MM-DD');

    // Turnos del día actual
    const appointments = await this.appointmentsRepo
      .createQueryBuilder('appointment')
      .where('appointment.plantId = :plantId', { plantId: plant.id })
      .andWhere('appointment.appointmentDate = :currentDate', { currentDate })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: [
          AppointmentStatus.PAID,
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.COMPLETED,
        ],
      })
      .orderBy('appointment.appointmentTime', 'ASC')
      .getMany();

    // Cargar detalles y cobros para cada turno
    const turnosDia = [];
    for (const apt of appointments) {
      const details = await this.detailsRepo.findOne({
        where: { appointmentId: apt.id },
      });

      const payment = await this.paymentsRepo.findOne({
        where: { appointmentId: apt.id },
        order: { createdAt: 'DESC' },
      });

      turnosDia.push({
        id: apt.id,
        fecha: apt.appointmentDate,
        hora: apt.appointmentTime,
        estado: apt.status,
        datos: details || null,
        cobro: payment || null,
      });
    }

    // Días futuros con turnos
    const diasFuturos = await this.appointmentsRepo
      .createQueryBuilder('appointment')
      .select('DISTINCT appointment.appointmentDate', 'fecha')
      .where('appointment.plantId = :plantId', { plantId: plant.id })
      .andWhere('appointment.appointmentDate >= :currentDate', { currentDate })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: [
          AppointmentStatus.PAID,
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.COMPLETED,
        ],
      })
      .orderBy('appointment.appointmentDate', 'ASC')
      .getRawMany();

    return {
      turnosDia,
      diasFuturos: diasFuturos.map((d) => d.fecha),
    };
  }

  async getTurnosDiaFuturo(plant: Plant, dia: string) {
    const appointments = await this.appointmentsRepo
      .createQueryBuilder('appointment')
      .where('appointment.plantId = :plantId', { plantId: plant.id })
      .andWhere('appointment.appointmentDate = :dia', { dia })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: [
          AppointmentStatus.PAID,
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.COMPLETED,
        ],
      })
      .orderBy('appointment.appointmentTime', 'ASC')
      .getMany();

    const resultado = [];
    for (const apt of appointments) {
      const details = await this.detailsRepo.findOne({
        where: { appointmentId: apt.id },
      });

      const payment = await this.paymentsRepo.findOne({
        where: { appointmentId: apt.id },
        order: { createdAt: 'DESC' },
      });

      resultado.push({
        id: apt.id,
        fecha: apt.appointmentDate,
        hora: apt.appointmentTime,
        estado: apt.status,
        datos: details || null,
        cobro: payment || null,
      });
    }

    return resultado;
  }

  async getVehicleTypes(plant: Plant) {
    return this.pricingRepo.find({
      where: { plantId: plant.id },
      order: { vehicleType: 'ASC' },
    });
  }

  async getAppointmentData(plant: Plant, appointmentId: string) {
    const appointment = await this.appointmentsRepo.findOne({
      where: { id: appointmentId, plantId: plant.id },
    });

    if (!appointment) {
      throw new NotFoundException('Turno no encontrado');
    }

    const details = await this.detailsRepo.findOne({
      where: { appointmentId: appointment.id },
    });

    const payment = await this.paymentsRepo.findOne({
      where: { appointmentId: appointment.id },
      order: { createdAt: 'DESC' },
    });

    return {
      ...appointment,
      datos: details || null,
      cobro: payment || null,
    };
  }

  async searchAppointmentById(plant: Plant, appointmentId: string) {
    return this.getAppointmentData(plant, appointmentId);
  }

  async searchAppointmentByDomain(plant: Plant, dominio: string) {
    const details = await this.detailsRepo
      .createQueryBuilder('d')
      .innerJoin('appointments', 'a', 'a.id = d."appointmentId"')
      .where('a."plantId" = :plantId', { plantId: plant.id })
      .andWhere('UPPER(d."vehicleDomain") = :dominio', { dominio: dominio.toUpperCase() })
      .orderBy('a."appointmentDate"', 'DESC')
      .addOrderBy('a."appointmentTime"', 'DESC')
      .limit(1)
      .getRawOne();

    if (!details) {
      throw new NotFoundException('Turno no encontrado para dominio');
    }

    return this.getAppointmentData(plant, details.d_appointmentId);
  }

  async getTurnosParaReprog(plant: Plant) {
    const currentDate = moment().subtract(3, 'hours').format('YYYY-MM-DD');
    const appointments = await this.appointmentsRepo
      .createQueryBuilder('appointment')
      .where('appointment.plantId = :plantId', { plantId: plant.id })
      .andWhere('appointment.appointmentDate >= :currentDate', { currentDate })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: [
          AppointmentStatus.PAID,
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.COMPLETED,
        ],
      })
      .orderBy('appointment.appointmentDate', 'ASC')
      .addOrderBy('appointment.appointmentTime', 'ASC')
      .getMany();

    return appointments;
  }

  async markAppointmentCompleted(plant: Plant, appointmentId: string) {
    const appointment = await this.appointmentsRepo.findOne({
      where: { id: appointmentId, plantId: plant.id },
    });

    if (!appointment) {
      throw new NotFoundException('Turno no encontrado');
    }

    appointment.status = AppointmentStatus.COMPLETED;
    await this.appointmentsRepo.save(appointment);

    return { success: true, message: 'Turno marcado como realizado' };
  }

  // POST /api/auth/creTur - Crear turno manual
  async createAppointment(plant: Plant, dto: CreateAppointmentDto) {
    // Buscar turno disponible en la fecha/hora especificada
    const existingAppointment = await this.appointmentsRepo.findOne({
      where: {
        plantId: plant.id,
        appointmentDate: dto.fecha,
        appointmentTime: dto.hora,
        lineId: dto.linea ? dto.linea.toString() : null,
        status: AppointmentStatus.AVAILABLE,
      },
    });

    if (!existingAppointment) {
      throw new NotFoundException('No hay turno disponible en la fecha/hora especificada');
    }

    // Obtener precio
    const pricing = await this.pricingRepo.findOne({
      where: {
        plantId: plant.id,
        vehicleType: dto.tipo_vehiculo,
      },
    });

    if (!pricing) {
      throw new BadRequestException('Tipo de vehículo no válido');
    }

    // Actualizar turno
    existingAppointment.status = AppointmentStatus.CONFIRMED;
    existingAppointment.origin = AppointmentOrigin.ADMIN;
    existingAppointment.reservedAt = new Date();
    await this.appointmentsRepo.save(existingAppointment);

    // Crear datos del turno
    const detail = this.detailsRepo.create({
      appointmentId: existingAppointment.id,
      vehicleDomain: dto.dominio.toUpperCase(),
      customerName: dto.nombre,
      customerEmail: dto.email,
      customerPhone: dto.telefono,
      vehicleType: dto.tipo_vehiculo,
      vehicleFuel: dto.combustible || '',
      price: pricing.price,
    });
    await this.detailsRepo.save(detail);

    // Enviar email de confirmación
    await this.emailService.sendAppointmentEmail({
      plant,
      appointment: existingAppointment,
      detail,
      type: 'confirmation',
    });

    return {
      success: true,
      turno_id: existingAppointment.id,
      fecha: existingAppointment.appointmentDate,
      hora: existingAppointment.appointmentTime,
      message: 'Turno creado exitosamente',
    };
  }

  // POST /api/auth/regPag - Registrar pago
  async registerPayment(plant: Plant, dto: RegisterPaymentDto) {
    // Buscar turno
    const appointment = await this.appointmentsRepo.findOne({
      where: {
        id: dto.turno_id,
        plantId: plant.id,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Turno no encontrado');
    }

    // Obtener detalles
    const detail = await this.detailsRepo.findOne({
      where: { appointmentId: appointment.id },
    });

    if (!detail) {
      throw new NotFoundException('Datos del turno no encontrados');
    }

    // Crear pago
    const payment = this.paymentsRepo.create({
      appointmentId: appointment.id,
      amount: detail.price,
      currency: 'ARS',
      method: dto.metodo,
      platform: dto.metodo === 'efectivo' ? 'efectivo' : dto.metodo,
      transactionId: dto.transaction_id || null,
      reference: dto.referencia || `${appointment.id}${moment().format('dmYHis')}`,
      status: PaymentStatus.APPROVED,
      origin: AppointmentOrigin.ADMIN,
      paymentDate: new Date(),
    });
    await this.paymentsRepo.save(payment);

    // Actualizar estado del turno
    appointment.status = AppointmentStatus.PAID;
    await this.appointmentsRepo.save(appointment);

    return {
      success: true,
      pago_id: payment.id,
      turno_id: appointment.id,
      monto: payment.amount,
      message: 'Pago registrado exitosamente',
    };
  }

  // POST /api/auth/repTur - Reprogramar turno
  async rescheduleAppointment(plant: Plant, dto: RescheduleAppointmentDto) {
    // Buscar turno actual
    const currentAppointment = await this.appointmentsRepo.findOne({
      where: {
        id: dto.turno_id,
        plantId: plant.id,
      },
    });

    if (!currentAppointment) {
      throw new NotFoundException('Turno no encontrado');
    }

    // Obtener detalles
    const detail = await this.detailsRepo.findOne({
      where: { appointmentId: currentAppointment.id },
    });

    if (!detail) {
      throw new NotFoundException('Datos del turno no encontrados');
    }

    // Buscar nuevo turno disponible
    const newAppointment = await this.appointmentsRepo.findOne({
      where: {
        plantId: plant.id,
        appointmentDate: dto.nueva_fecha,
        appointmentTime: dto.nueva_hora,
        lineId: dto.nueva_linea ? dto.nueva_linea.toString() : null,
        status: AppointmentStatus.AVAILABLE,
      },
    });

    if (!newAppointment) {
      throw new NotFoundException('No hay turno disponible en la nueva fecha/hora');
    }

    // Guardar status original antes de liberar
    const originalStatus = currentAppointment.status;

    // Liberar turno anterior
    currentAppointment.status = AppointmentStatus.AVAILABLE;
    currentAppointment.reservedAt = null;
    currentAppointment.origin = null;
    await this.appointmentsRepo.save(currentAppointment);

    // Marcar nuevo turno con el mismo status que tenía el anterior
    newAppointment.status = originalStatus;
    newAppointment.origin = AppointmentOrigin.ADMIN;
    newAppointment.reservedAt = new Date();
    await this.appointmentsRepo.save(newAppointment);

    // Actualizar detalle con nuevo ID de turno
    detail.appointmentId = newAppointment.id;
    await this.detailsRepo.save(detail);

    // Si hay pagos, actualizarlos también
    await this.paymentsRepo.update(
      { appointmentId: currentAppointment.id },
      { appointmentId: newAppointment.id },
    );

    // Enviar email
    await this.emailService.sendAppointmentEmail({
      plant,
      appointment: newAppointment,
      detail,
      type: 'reschedule',
    });

    return {
      success: true,
      turno_id: newAppointment.id,
      fecha: newAppointment.appointmentDate,
      hora: newAppointment.appointmentTime,
      message: 'Turno reprogramado exitosamente',
    };
  }
}
