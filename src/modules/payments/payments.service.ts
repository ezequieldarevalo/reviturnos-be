import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '@/database/entities/payment.entity';
import { Plant } from '@/database/entities/plant.entity';
import { Appointment } from '@/database/entities/appointment.entity';
import { AppointmentDetail } from '@/database/entities/appointment-detail.entity';
import { ConfirmQuoteDto } from '../appointments/dto';
import { AppointmentStatus, PaymentStatus } from '@/common/constants';
import { EmailService } from '../email/email.service';
import * as moment from 'moment';
import axios from 'axios';
import { IsNull, Not } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { decryptSecret } from '@/common/utils/secret-crypto.util';
import { randomBytes } from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly legacyExcludedPaymentMethods = [
    'bapropagos',
    'rapipago',
    'pagofacil',
    'cargavirtual',
    'redlink',
    'cobroexpress',
  ];
  private readonly legacyCashExcludedPaymentMethods = [
    'bapropagos',
    'cargavirtual',
    'redlink',
    'cobroexpress',
  ];

  constructor(
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    @InjectRepository(AppointmentDetail)
    private detailRepo: Repository<AppointmentDetail>,
    @InjectRepository(Plant)
    private plantRepo: Repository<Plant>,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  private getPlantMercadoPagoToken(plant: Plant): string {
    if (!plant?.mpToken) {
      throw new Error('MELI_TOKEN_NOT_CONFIGURED');
    }

    const encryptionKey =
      this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY') ||
      this.configService.get<string>('JWT_SECRET');
    if (!encryptionKey) {
      throw new Error('CREDENTIALS_ENCRYPTION_KEY_NOT_CONFIGURED');
    }
    return decryptSecret(plant.mpToken, encryptionKey);
  }

  async createPaymentOrder(plant: Plant, appointment: Appointment, dto: ConfirmQuoteDto) {
    const currentDate = new Date();
    const plantCode = (plant.code || 'plant')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 10);
    const domain = (dto.dominio || 'nodom')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 10);
    const timestamp = moment(currentDate).format('YYMMDDHHmmss');
    const plantNumber =
      appointment.plantAppointmentNumber !== undefined &&
      appointment.plantAppointmentNumber !== null
        ? `N${appointment.plantAppointmentNumber}`
        : null;
    const uniquePart = appointment.id
      ? appointment.id.replace(/-/g, '').slice(-8).toUpperCase()
      : randomBytes(4).toString('hex').toUpperCase();

    // Formato legible y corto: RT-{planta}-{fecha}-{dominio}-{N<idPlanta>|unique}
    const reference = `RT-${plantCode}-${timestamp}-${domain}-${plantNumber || uniquePart}`;
    const paymentPlatform = (dto.plataforma_pago || '').toLowerCase();

    if (paymentPlatform === 'mercadopago') {
      return this.createMercadoPagoPreference(plant, appointment, dto, reference);
    }

    return {
      payment_id: '',
      url_pago: '',
      reference,
    };
  }

  private async createMercadoPagoPreference(
    plant: Plant,
    appointment: Appointment,
    dto: ConfirmQuoteDto,
    reference: string,
  ) {
    const currentDate = new Date();

    // Vencimientos
    const expirationMinutes = plant.config?.payment?.expirationMinutes || 120;
    const cashExpirationMinutes = plant.config?.payment?.cashExpirationMinutes || 1440;
    const marginPostCashMinutes = plant.config?.payment?.marginPostCashPaymentMinutes || 0;

    const cardExpiration = moment(currentDate).add(cashExpirationMinutes, 'minutes');
    const cashExpiration = moment(currentDate).add(cashExpirationMinutes, 'minutes');

    // Formatear fechas ISO 8601 con timezone
    const expirationDateTo = cardExpiration.format('YYYY-MM-DDTHH:mm:ss.SSS') + '-03:00';
    const dateOfExpiration = cashExpiration.format('YYYY-MM-DDTHH:mm:ss.SSS') + '-03:00';

    // Determinar si permitir efectivo
    const cashMethodsLimitMinutes =
      expirationMinutes + cashExpirationMinutes + marginPostCashMinutes;
    const appointmentDateTime = moment(
      `${appointment.appointmentDate} ${appointment.appointmentTime}`,
    );
    const cashMethodsLimit = moment(currentDate).add(cashMethodsLimitMinutes, 'minutes');
    const allowCashMethods = cashMethodsLimit.isBefore(appointmentDateTime);

    // Métodos de pago excluidos
    const mpCfg = (plant.config?.integrations?.mercadopago || {}) as any;
    const configuredExcluded = mpCfg.excludedPaymentMethods;
    const configuredCashExcluded = (mpCfg as any).cashExcludedPaymentMethods;

    let excludedPaymentMethods: string[] = [];
    if (plant.code === 'lasheras' || plant.code === 'maipu') {
      if (allowCashMethods) {
        // Permitir efectivo: excluir métodos no efectivo (paridad legacy)
        excludedPaymentMethods = configuredCashExcluded || this.legacyCashExcludedPaymentMethods;
      } else {
        // NO permitir efectivo: excluir incluyendo Rapipago/PagoFácil (paridad legacy)
        excludedPaymentMethods = configuredExcluded || this.legacyExcludedPaymentMethods;
      }
    } else {
      // Otras plantas: lista general (paridad legacy)
      excludedPaymentMethods = configuredExcluded || this.legacyExcludedPaymentMethods;
    }

    // Obtener precio
    const pricing = await this.getPricing();

    // Crear preferencia en MercadoPago
    const preferenceData = {
      external_reference: reference,
      notification_url: this.buildMercadoPagoNotificationUrl(plant),
      payer: {
        name: dto.nombre,
        email: dto.email,
      },
      items: [
        {
          title: `RTO: ${reference}`,
          quantity: 1,
          unit_price: pricing,
          currency_id: 'ARS',
        },
      ],
      payment_methods: {
        excluded_payment_methods: excludedPaymentMethods.map((id) => ({ id })),
      },
      expires: true,
      expiration_date_to: expirationDateTo,
      date_of_expiration: dateOfExpiration,
    };

    try {
      const mpToken = this.getPlantMercadoPagoToken(plant);
      const response = await axios.post(
        'https://api.mercadopago.com/checkout/preferences',
        preferenceData,
        {
          headers: {
            Authorization: `Bearer ${mpToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        payment_id: reference,
        url_pago: response.data.init_point,
        reference,
      };
    } catch (error) {
      this.logger.error('Error creating MercadoPago preference:', error);
      throw new Error('MELI_ERROR');
    }
  }

  async processMercadoPagoWebhook(payload: any, plantCode?: string) {
    this.logger.log(
      `MercadoPago webhook received (plant=${plantCode || 'unknown'}): ${JSON.stringify(payload)}`,
    );

    const topic = payload?.topic || payload?.type || payload?.action;
    const paymentId = payload?.data?.id || payload?.['data.id'] || payload?.id;

    if (topic && topic !== 'payment') {
      this.logger.log(`Ignoring MercadoPago webhook topic=${topic}`);
      return { status: 'OK' };
    }

    if (!paymentId) {
      this.logger.warn('Webhook without payment ID');
      return { status: 'OK' };
    }

    try {
      // Consultar datos del pago en MercadoPago usando token de planta correcto
      const resolved = await this.resolveMercadoPagoPayment(paymentId, plantCode);
      const paymentData = resolved?.paymentData;
      const webhookPlant = resolved?.plant;

      if (!paymentData) {
        this.logger.warn(`Payment not found: ${paymentId}`);
        return { status: 'OK' };
      }

      // Buscar turno por external_reference
      const appointment = await this.appointmentRepo.findOne({
        where: { paymentId: paymentData.external_reference },
        relations: ['plant'],
      });

      if (!appointment) {
        this.logger.warn(`Appointment not found for reference: ${paymentData.external_reference}`);
        return { status: 'OK' };
      }

      if (webhookPlant && appointment.plantId !== webhookPlant.id) {
        this.logger.warn(
          `Webhook plant mismatch: webhook=${webhookPlant.code} appointmentPlant=${appointment.plant?.code}`,
        );
        return { status: 'OK' };
      }

      // Procesar según estado del pago
      if (paymentData.status === 'approved') {
        await this.handleApprovedPayment(appointment, paymentData);
      } else if (
        paymentData.status === 'pending' &&
        (paymentData.payment_method_id === 'rapipago' ||
          paymentData.payment_method_id === 'pagofacil')
      ) {
        await this.handlePendingCashPayment(appointment, paymentData);
      }

      return { status: 'OK' };
    } catch (error) {
      this.logger.error(`Error processing webhook: ${error.message}`);
      return { status: 'OK' };
    }
  }

  async processYacareWebhook(payload: any) {
    this.logger.log(`Yacare webhook received: ${JSON.stringify(payload)}`);
    // Mantener respuesta compatible con legado: siempre OK para evitar reintentos masivos.
    return { status: 'OK' };
  }

  private async getMercadoPagoPayment(paymentId: string, mpToken: string) {
    try {
      const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        params: { access_token: mpToken },
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching payment from MercadoPago: ${error.message}`);
      return null;
    }
  }

  private getMercadoPagoNotificationBaseUrl(): string {
    const configuredBaseUrl =
      this.configService.get<string>('MERCADOPAGO_NOTIFICATION_BASE_URL') ||
      this.configService.get<string>('APP_URL');

    const baseUrl = (configuredBaseUrl || '').trim();
    if (!baseUrl) {
      throw new Error('MELI_NOTIF_BASE_URL_NOT_CONFIGURED');
    }

    return baseUrl.replace(/\/+$/, '');
  }

  private buildMercadoPagoNotificationUrl(plant: Plant): string {
    const baseUrl = this.getMercadoPagoNotificationBaseUrl();
    const endpoint = /\/api\/auth\/notifMeli$/i.test(baseUrl)
      ? baseUrl
      : `${baseUrl}/api/auth/notifMeli`;

    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}plant=${encodeURIComponent(plant.code)}`;
  }

  private async resolveMercadoPagoPayment(paymentId: string, plantCode?: string) {
    if (plantCode) {
      const plant = await this.plantRepo.findOne({ where: { code: plantCode } });
      if (!plant?.mpToken) {
        this.logger.warn(`Plant or MercadoPago token not configured for plant=${plantCode}`);
        return null;
      }

      let mpToken = '';
      try {
        mpToken = this.getPlantMercadoPagoToken(plant);
      } catch (error) {
        this.logger.warn(`Invalid MercadoPago token for plant=${plantCode}`);
        return null;
      }

      const paymentData = await this.getMercadoPagoPayment(paymentId, mpToken);
      if (paymentData) return { paymentData, plant };
      return null;
    }

    const plants = await this.plantRepo.find({
      where: {
        mpToken: Not(IsNull()),
      },
    });

    for (const plant of plants) {
      if (!plant.mpToken) continue;
      let mpToken = '';
      try {
        mpToken = this.getPlantMercadoPagoToken(plant);
      } catch (_error) {
        continue;
      }

      const paymentData = await this.getMercadoPagoPayment(paymentId, mpToken);
      if (paymentData) return { paymentData, plant };
    }

    return null;
  }

  private async handleApprovedPayment(appointment: Appointment, paymentData: any) {
    this.logger.log(`Processing approved payment for appointment ${appointment.id}`);

    // Actualizar estado del turno
    appointment.status = AppointmentStatus.PAID;
    await this.appointmentRepo.save(appointment);

    // Registrar pago
    const payment = this.paymentRepo.create({
      appointmentId: appointment.id,
      amount: paymentData.transaction_amount,
      currency: 'ARS',
      platform: 'mercadopago',
      method: `${paymentData.payment_type_id} - ${paymentData.payment_method_id}`,
      externalPaymentId: `MP-${paymentData.id}`,
      transactionId: paymentData.id.toString(),
      reference: paymentData.external_reference,
      status: PaymentStatus.APPROVED,
      paymentDate: new Date(paymentData.date_approved),
    });
    await this.paymentRepo.save(payment);

    // Enviar email de confirmación de pago
    const detail = await this.detailRepo.findOne({
      where: { appointmentId: appointment.id },
    });

    if (detail) {
      await this.emailService.sendAppointmentEmail({
        plant: appointment.plant,
        appointment,
        detail,
        type: 'payment-confirmation',
      });
    }

    this.logger.log(`Payment approved and processed for appointment ${appointment.id}`);
  }

  private async handlePendingCashPayment(appointment: Appointment, paymentData: any) {
    this.logger.log(`Updating expiration for pending cash payment: ${appointment.id}`);

    // MercadoPago puede extender el vencimiento
    if (paymentData.date_of_expiration) {
      const newExpiration = moment(paymentData.date_of_expiration).toDate();
      appointment.reservationExpiresAt = newExpiration;
      await this.appointmentRepo.save(appointment);

      this.logger.log(`Expiration updated to ${newExpiration} for appointment ${appointment.id}`);
    }
  }

  private async getPricing(): Promise<number> {
    // TODO: Query pricing table
    return 8500; // Placeholder
  }
}
