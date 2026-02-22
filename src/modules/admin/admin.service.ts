import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as moment from 'moment';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Appointment } from '@/database/entities/appointment.entity';
import { AppointmentDetail } from '@/database/entities/appointment-detail.entity';
import { Payment } from '@/database/entities/payment.entity';
import { Plant } from '@/database/entities/plant.entity';
import { Pricing } from '@/database/entities/pricing.entity';
import { User } from '@/database/entities/user.entity';
import { AdminActionLog } from '@/database/entities/admin-action-log.entity';
import { AppointmentStatus, AppointmentOrigin, PaymentStatus, UserRole } from '@/common/constants';
import { EmailService } from '../email/email.service';
import {
  CreateAppointmentDto,
  RegisterPaymentDto,
  RescheduleAppointmentDto,
  UpdateMercadoPagoConfigDto,
  SuperAdminCreatePlantDto,
  SuperAdminUpdatePlantDto,
  SuperAdminCreateUserDto,
  SuperAdminUpdateUserDto,
  ListActionLogsDto,
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
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(AdminActionLog)
    private adminActionLogsRepo: Repository<AdminActionLog>,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  private assertPlantReadAccess(plant: Plant, user: User) {
    if (!user || !user.active) {
      throw new ForbiddenException('Usuario no autorizado');
    }
    if (user.role === UserRole.SUPERADMIN) return;
    if (![UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER].includes(user.role)) {
      throw new ForbiddenException('Permisos insuficientes');
    }
    if (user.plantId !== plant.id) {
      throw new ForbiddenException('Usuario sin acceso a esta planta');
    }
  }

  private assertPlantWriteAccess(plant: Plant, user: User) {
    if (!user || !user.active) {
      throw new ForbiddenException('Usuario no autorizado');
    }
    if (user.role === UserRole.SUPERADMIN) return;
    if (![UserRole.ADMIN, UserRole.OPERATOR].includes(user.role)) {
      throw new ForbiddenException('Permisos insuficientes');
    }
    if (user.plantId !== plant.id) {
      throw new ForbiddenException('Usuario sin acceso a esta planta');
    }
  }

  private assertPlantAdmin(plant: Plant, user: User) {
    if (!user || !user.active) {
      throw new ForbiddenException('Usuario no autorizado');
    }
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException('Permisos insuficientes');
    }
    if (user.role === UserRole.ADMIN && user.plantId !== plant.id) {
      throw new ForbiddenException('Usuario sin acceso a esta planta');
    }
  }

  private assertSuperAdmin(user: User) {
    if (!user || !user.active) {
      throw new ForbiddenException('Usuario no autorizado');
    }
    if (user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException('Permisos insuficientes');
    }
  }

  private async logAdminAction(args: {
    user: User;
    plantId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    before?: any;
    after?: any;
    metadata?: any;
  }) {
    try {
      const log = this.adminActionLogsRepo.create({
        plantId: args.plantId || null,
        userId: args.user.id,
        userEmail: args.user.email,
        userRole: args.user.role,
        action: args.action,
        targetType: args.targetType,
        targetId: args.targetId || null,
        before: args.before || {},
        after: args.after || {},
        metadata: args.metadata || {},
      });
      await this.adminActionLogsRepo.save(log);
    } catch (_e) {
      // no-op: audit logging must not break core operation
    }
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      plantId: user.plantId,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async listActionLogsByPlant(plant: Plant, user: User, query: ListActionLogsDto) {
    this.assertPlantReadAccess(plant, user);

    const limit = Math.min(Math.max(query.limit || 50, 1), 200);

    const qb = this.adminActionLogsRepo
      .createQueryBuilder('log')
      .where('log.plantId = :plantId', { plantId: plant.id });

    if (query.action) qb.andWhere('log.action = :action', { action: query.action });
    if (query.userId) qb.andWhere('log.userId = :userId', { userId: query.userId });
    if (query.targetType) {
      qb.andWhere('log.targetType = :targetType', { targetType: query.targetType });
    }

    return qb.orderBy('log.createdAt', 'DESC').limit(limit).getMany();
  }

  async listActionLogsForSuperAdmin(user: User, query: ListActionLogsDto) {
    this.assertSuperAdmin(user);

    const limit = Math.min(Math.max(query.limit || 100, 1), 300);

    const qb = this.adminActionLogsRepo.createQueryBuilder('log');

    if (query.plantId) qb.andWhere('log.plantId = :plantId', { plantId: query.plantId });
    if (query.action) qb.andWhere('log.action = :action', { action: query.action });
    if (query.userId) qb.andWhere('log.userId = :userId', { userId: query.userId });
    if (query.targetType) {
      qb.andWhere('log.targetType = :targetType', { targetType: query.targetType });
    }

    return qb.orderBy('log.createdAt', 'DESC').limit(limit).getMany();
  }

  async listPlantsForSuperAdmin(user: User) {
    this.assertSuperAdmin(user);

    return this.plantsRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async createPlantForSuperAdmin(user: User, dto: SuperAdminCreatePlantDto) {
    this.assertSuperAdmin(user);

    const code = dto.code.trim().toLowerCase();
    const slug = (dto.slug || dto.code).trim().toLowerCase();

    const existing = await this.plantsRepo.findOne({ where: [{ code }, { slug }] });
    if (existing) {
      throw new BadRequestException('Ya existe una planta con ese código o slug');
    }

    const plant = this.plantsRepo.create({
      code,
      slug,
      name: dto.name.trim(),
      address: dto.address?.trim() || null,
      active: dto.active ?? true,
      config: {
        schedules: {
          monday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          tuesday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          wednesday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          thursday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          friday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
        },
        holidays: [],
        nonWorkingDays: [0, 6],
        payment: {
          expirationMinutes: 120,
          cashExpirationMinutes: 2880,
          marginPostCashPaymentMinutes: 120,
          validatePendingQuotes: false,
          requiresPayment: true,
        },
        business: {
          ignoreVehicleLines: false,
          daysAvailableInAdvance: 30,
        },
        integrations: {
          mercadopago: { enabled: false, excludedPaymentMethods: [] },
          rto: { enabled: true, confirmQuotes: false },
        },
      },
    });

    await this.plantsRepo.save(plant);

    await this.logAdminAction({
      user,
      plantId: plant.id,
      action: 'super.plant.create',
      targetType: 'plant',
      targetId: plant.id,
      after: { code: plant.code, slug: plant.slug, name: plant.name, active: plant.active },
    });

    return {
      success: true,
      message: 'Planta creada',
      plant,
    };
  }

  async updatePlantForSuperAdmin(user: User, plantId: string, dto: SuperAdminUpdatePlantDto) {
    this.assertSuperAdmin(user);

    const plant = await this.plantsRepo.findOne({ where: { id: plantId } });
    if (!plant) {
      throw new NotFoundException('Planta no encontrada');
    }

    const before = {
      slug: plant.slug,
      name: plant.name,
      address: plant.address,
      active: plant.active,
    };

    if (dto.slug !== undefined) {
      plant.slug = dto.slug.trim().toLowerCase();
    }
    if (dto.name !== undefined) {
      plant.name = dto.name.trim();
    }
    if (dto.address !== undefined) {
      plant.address = dto.address?.trim() || null;
    }
    if (dto.active !== undefined) {
      plant.active = dto.active;
    }

    await this.plantsRepo.save(plant);

    await this.logAdminAction({
      user,
      plantId: plant.id,
      action: 'super.plant.update',
      targetType: 'plant',
      targetId: plant.id,
      before,
      after: {
        slug: plant.slug,
        name: plant.name,
        address: plant.address,
        active: plant.active,
      },
    });

    return {
      success: true,
      message: 'Planta actualizada',
      plant,
    };
  }

  async deactivatePlantForSuperAdmin(user: User, plantId: string) {
    this.assertSuperAdmin(user);

    const plant = await this.plantsRepo.findOne({ where: { id: plantId } });
    if (!plant) {
      throw new NotFoundException('Planta no encontrada');
    }

    plant.active = false;
    await this.plantsRepo.save(plant);

    await this.logAdminAction({
      user,
      plantId: plant.id,
      action: 'super.plant.deactivate',
      targetType: 'plant',
      targetId: plant.id,
      before: { active: true },
      after: { active: false },
    });

    return {
      success: true,
      message: 'Planta desactivada',
      plant,
    };
  }

  async listUsersForSuperAdmin(user: User, plantId?: string) {
    this.assertSuperAdmin(user);

    const where = plantId ? { plantId } : {};
    const users = await this.usersRepo.find({
      where,
      relations: ['plant'],
      order: { createdAt: 'DESC' },
    });

    return users.map((u) => ({
      ...this.serializeUser(u),
      plant: u.plant
        ? {
            id: u.plant.id,
            code: u.plant.code,
            name: u.plant.name,
            active: u.plant.active,
          }
        : null,
    }));
  }

  async createUserForSuperAdmin(user: User, dto: SuperAdminCreateUserDto) {
    this.assertSuperAdmin(user);

    const plant = await this.plantsRepo.findOne({ where: { id: dto.plantId } });
    if (!plant) {
      throw new NotFoundException('Planta no encontrada');
    }

    const email = dto.email.trim().toLowerCase();
    const exists = await this.usersRepo.findOne({ where: { email } });
    if (exists) {
      throw new BadRequestException('Email ya registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const newUser = this.usersRepo.create({
      plantId: dto.plantId,
      name: dto.name?.trim() || null,
      email,
      passwordHash,
      role: dto.role ?? UserRole.OPERATOR,
      active: dto.active ?? true,
    });

    await this.usersRepo.save(newUser);

    await this.logAdminAction({
      user,
      plantId: newUser.plantId,
      action: 'super.user.create',
      targetType: 'user',
      targetId: newUser.id,
      after: {
        email: newUser.email,
        role: newUser.role,
        active: newUser.active,
        plantId: newUser.plantId,
      },
    });

    return {
      success: true,
      message: 'Usuario creado',
      user: this.serializeUser(newUser),
    };
  }

  async updateUserForSuperAdmin(user: User, userId: string, dto: SuperAdminUpdateUserDto) {
    this.assertSuperAdmin(user);

    const existingUser = await this.usersRepo.findOne({ where: { id: userId } });
    if (!existingUser) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const before = {
      plantId: existingUser.plantId,
      name: existingUser.name,
      role: existingUser.role,
      active: existingUser.active,
    };

    if (dto.plantId !== undefined) {
      const plant = await this.plantsRepo.findOne({ where: { id: dto.plantId } });
      if (!plant) {
        throw new NotFoundException('Planta no encontrada');
      }
      existingUser.plantId = dto.plantId;
    }

    if (dto.name !== undefined) {
      existingUser.name = dto.name?.trim() || null;
    }

    if (dto.role !== undefined) {
      existingUser.role = dto.role;
    }

    if (dto.active !== undefined) {
      existingUser.active = dto.active;
    }

    if (dto.password) {
      existingUser.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    await this.usersRepo.save(existingUser);

    await this.logAdminAction({
      user,
      plantId: existingUser.plantId,
      action: 'super.user.update',
      targetType: 'user',
      targetId: existingUser.id,
      before,
      after: {
        plantId: existingUser.plantId,
        name: existingUser.name,
        role: existingUser.role,
        active: existingUser.active,
      },
    });

    return {
      success: true,
      message: 'Usuario actualizado',
      user: this.serializeUser(existingUser),
    };
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

    const before = {
      notifUrl: currentPlant.mpNotifUrl || null,
      redirectUrl: currentPlant.mpRedirectUrl || null,
      enabled: currentPlant.config?.integrations?.mercadopago?.enabled ?? false,
      excludedPaymentMethods:
        currentPlant.config?.integrations?.mercadopago?.excludedPaymentMethods || [],
      configured: !!currentPlant.mpToken,
    };

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

    await this.logAdminAction({
      user,
      plantId: currentPlant.id,
      action: 'plant.mp_config.update',
      targetType: 'plant',
      targetId: currentPlant.id,
      before,
      after: {
        notifUrl: currentPlant.mpNotifUrl || null,
        redirectUrl: currentPlant.mpRedirectUrl || null,
        enabled: currentPlant.config?.integrations?.mercadopago?.enabled ?? false,
        excludedPaymentMethods:
          currentPlant.config?.integrations?.mercadopago?.excludedPaymentMethods || [],
        configured: !!currentPlant.mpToken,
      },
      metadata: {
        tokenUpdated: !!dto.accessToken,
      },
    });

    return {
      success: true,
      message: 'Configuración de MercadoPago actualizada',
      configured: !!currentPlant.mpToken,
      tokenMasked: maskSecret(currentPlant.mpToken),
      enabled: currentPlant.config?.integrations?.mercadopago?.enabled ?? false,
    };
  }

  async getTurnosDiaActual(plant: Plant, user: User) {
    this.assertPlantReadAccess(plant, user);

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

  async getTurnosDiaFuturo(plant: Plant, user: User, dia: string) {
    this.assertPlantReadAccess(plant, user);

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

  async getVehicleTypes(plant: Plant, user: User) {
    this.assertPlantReadAccess(plant, user);

    return this.pricingRepo.find({
      where: { plantId: plant.id },
      order: { vehicleType: 'ASC' },
    });
  }

  async getAppointmentData(plant: Plant, user: User, appointmentId: string) {
    this.assertPlantReadAccess(plant, user);

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

  async searchAppointmentById(plant: Plant, user: User, appointmentId: string) {
    return this.getAppointmentData(plant, user, appointmentId);
  }

  async searchAppointmentByDomain(plant: Plant, user: User, dominio: string) {
    this.assertPlantReadAccess(plant, user);

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

    return this.getAppointmentData(plant, user, details.d_appointmentId);
  }

  async getTurnosParaReprog(plant: Plant, user: User) {
    this.assertPlantReadAccess(plant, user);

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

  async markAppointmentCompleted(plant: Plant, user: User, appointmentId: string) {
    this.assertPlantWriteAccess(plant, user);

    const appointment = await this.appointmentsRepo.findOne({
      where: { id: appointmentId, plantId: plant.id },
    });

    if (!appointment) {
      throw new NotFoundException('Turno no encontrado');
    }

    const previousStatus = appointment.status;
    appointment.status = AppointmentStatus.COMPLETED;
    await this.appointmentsRepo.save(appointment);

    await this.logAdminAction({
      user,
      plantId: plant.id,
      action: 'appointment.mark_completed',
      targetType: 'appointment',
      targetId: appointment.id,
      before: { status: previousStatus },
      after: { status: AppointmentStatus.COMPLETED },
    });

    return { success: true, message: 'Turno marcado como realizado' };
  }

  // POST /api/auth/creTur - Crear turno manual
  async createAppointment(plant: Plant, user: User, dto: CreateAppointmentDto) {
    this.assertPlantWriteAccess(plant, user);

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

    await this.logAdminAction({
      user,
      plantId: plant.id,
      action: 'appointment.create_manual',
      targetType: 'appointment',
      targetId: existingAppointment.id,
      after: {
        appointmentDate: existingAppointment.appointmentDate,
        appointmentTime: existingAppointment.appointmentTime,
        vehicleDomain: detail.vehicleDomain,
        vehicleType: detail.vehicleType,
      },
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
  async registerPayment(plant: Plant, user: User, dto: RegisterPaymentDto) {
    this.assertPlantWriteAccess(plant, user);

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

    await this.logAdminAction({
      user,
      plantId: plant.id,
      action: 'appointment.register_payment',
      targetType: 'payment',
      targetId: payment.id,
      after: {
        appointmentId: appointment.id,
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference,
      },
    });

    return {
      success: true,
      pago_id: payment.id,
      turno_id: appointment.id,
      monto: payment.amount,
      message: 'Pago registrado exitosamente',
    };
  }

  // POST /api/auth/repTur - Reprogramar turno
  async rescheduleAppointment(plant: Plant, user: User, dto: RescheduleAppointmentDto) {
    this.assertPlantWriteAccess(plant, user);

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
    const targetLineId = dto.nueva_linea ? dto.nueva_linea.toString() : null;
    let newAppointment = null;

    if (targetLineId) {
      newAppointment = await this.appointmentsRepo.findOne({
        where: {
          plantId: plant.id,
          appointmentDate: dto.nueva_fecha,
          appointmentTime: dto.nueva_hora,
          lineId: targetLineId,
          status: AppointmentStatus.AVAILABLE,
        },
      });
    } else {
      // Paridad legacy: si no viene línea, intentar misma línea actual y luego cualquiera
      if (currentAppointment.lineId) {
        newAppointment = await this.appointmentsRepo.findOne({
          where: {
            plantId: plant.id,
            appointmentDate: dto.nueva_fecha,
            appointmentTime: dto.nueva_hora,
            lineId: currentAppointment.lineId,
            status: AppointmentStatus.AVAILABLE,
          },
        });
      }

      if (!newAppointment) {
        newAppointment = await this.appointmentsRepo.findOne({
          where: {
            plantId: plant.id,
            appointmentDate: dto.nueva_fecha,
            appointmentTime: dto.nueva_hora,
            status: AppointmentStatus.AVAILABLE,
          },
          order: { lineId: 'ASC' },
        });
      }
    }

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

    await this.logAdminAction({
      user,
      plantId: plant.id,
      action: 'appointment.reschedule',
      targetType: 'appointment',
      targetId: newAppointment.id,
      before: {
        appointmentId: currentAppointment.id,
        appointmentDate: currentAppointment.appointmentDate,
        appointmentTime: currentAppointment.appointmentTime,
      },
      after: {
        appointmentId: newAppointment.id,
        appointmentDate: newAppointment.appointmentDate,
        appointmentTime: newAppointment.appointmentTime,
      },
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
