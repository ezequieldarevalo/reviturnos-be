import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Plant } from '@/database/entities/plant.entity';
import { Appointment } from '@/database/entities/appointment.entity';
import { AppointmentDetail } from '@/database/entities/appointment-detail.entity';
import * as moment from 'moment';
import { decryptSecret } from '@/common/utils/secret-crypto.util';

export interface SendAppointmentEmailOptions {
  plant: Plant;
  appointment: Appointment;
  detail: AppointmentDetail;
  type: 'confirmation' | 'payment-confirmation' | 'cancellation' | 'reschedule';
  paymentUrl?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {}

  private resolveSmtpPassword(plant: Plant): string {
    if (!plant.smtpPassword) return '';
    const key =
      this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY') ||
      this.configService.get<string>('JWT_SECRET');
    if (!key) return plant.smtpPassword;

    try {
      return decryptSecret(plant.smtpPassword, key);
    } catch {
      return plant.smtpPassword;
    }
  }

  private createTransporter(plant: Plant) {
    if (!plant.smtpHost || !plant.smtpUser) {
      this.logger.warn(`SMTP not configured for plant ${plant.code}`);
      return null;
    }

    return nodemailer.createTransport({
      host: plant.smtpHost,
      port: plant.smtpPort || 587,
      secure: plant.smtpEncryption === 'ssl',
      auth: {
        user: plant.smtpUser,
        pass: this.resolveSmtpPassword(plant),
      },
    });
  }

  async sendTestEmail(plant: Plant, to: string): Promise<boolean> {
    const transporter = this.createTransporter(plant);
    if (!transporter) {
      this.logger.error(`Cannot send test email: SMTP not configured for plant ${plant.code}`);
      return false;
    }

    try {
      await transporter.sendMail({
        from: `"${plant.emailFromName || plant.name}" <${plant.emailFrom || plant.smtpUser}>`,
        to,
        subject: `Prueba SMTP - ${plant.name}`,
        html: `
          <p>Hola,</p>
          <p>Este es un email de prueba del onboarding de <strong>${plant.name}</strong>.</p>
          <p>Si lo recibiste, la configuración SMTP funciona correctamente.</p>
        `,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send test email: ${error.message}`);
      return false;
    }
  }

  async sendAppointmentEmail(options: SendAppointmentEmailOptions): Promise<boolean> {
    const { plant, appointment, detail, type, paymentUrl } = options;

    const transporter = this.createTransporter(plant);
    if (!transporter) {
      this.logger.error(`Cannot send email: SMTP not configured for plant ${plant.code}`);
      return false;
    }

    try {
      const subject = this.getEmailSubject(type, plant.name);
      const html = this.getEmailTemplate(options);

      await transporter.sendMail({
        from: `"${plant.emailFromName || plant.name}" <${plant.emailFrom}>`,
        to: detail.customerEmail,
        subject,
        html,
      });

      this.logger.log(`Email sent to ${detail.customerEmail} for appointment ${appointment.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      return false;
    }
  }

  private getEmailSubject(type: string, plantName: string): string {
    switch (type) {
      case 'confirmation':
        return `Confirmación de turno - ${plantName}`;
      case 'payment-confirmation':
        return `Pago confirmado - Tu turno está reservado - ${plantName}`;
      case 'cancellation':
        return `Cancelación de turno - ${plantName}`;
      case 'reschedule':
        return `Reprogramación de turno - ${plantName}`;
      default:
        return `Turno RTO - ${plantName}`;
    }
  }

  private getEmailTemplate(options: SendAppointmentEmailOptions): string {
    const { plant, appointment, detail, type, paymentUrl } = options;
    const fecha = moment(appointment.appointmentDate).format('DD/MM/YYYY');
    const hora = appointment.appointmentTime;

    const baseStyles = `
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 20px; margin-top: 20px; }
        .info-box { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #3498db; }
        .button { display: inline-block; padding: 12px 30px; background: #3498db; color: white; text-decoration: none; border-radius: 4px; margin: 15px 0; }
        .footer { text-align: center; margin-top: 30px; color: #777; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 8px 0; }
        .label { font-weight: bold; width: 40%; }
      </style>
    `;

    if (type === 'confirmation') {
      return `
        <!DOCTYPE html>
        <html>
        <head>${baseStyles}</head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Confirmación de Turno</h1>
              <p>${plant.name}</p>
            </div>
            <div class="content">
              <p>Estimado/a <strong>${detail.customerName}</strong>,</p>
              <p>Su turno ha sido <strong>confirmado</strong> exitosamente.</p>
              
              <div class="info-box">
                <h3>Datos del Turno</h3>
                <table>
                  <tr>
                    <td class="label">Fecha:</td>
                    <td>${fecha}</td>
                  </tr>
                  <tr>
                    <td class="label">Hora:</td>
                    <td>${hora}</td>
                  </tr>
                  <tr>
                    <td class="label">Dominio:</td>
                    <td>${detail.vehicleDomain}</td>
                  </tr>
                  <tr>
                    <td class="label">Vehículo:</td>
                    <td>${detail.vehicleType}</td>
                  </tr>
                  <tr>
                    <td class="label">N° Turno:</td>
                    <td>${appointment.id}</td>
                  </tr>
                </table>
              </div>

              ${
                paymentUrl
                  ? `
              <div class="info-box">
                <h3>Pago Pendiente</h3>
                <p>Para completar su turno, debe realizar el pago:</p>
                <a href="${paymentUrl}" class="button">Pagar Ahora</a>
                <p style="font-size: 12px; color: #777;">Este enlace de pago expirará en 2 horas.</p>
              </div>
              `
                  : ''
              }

              <div class="info-box">
                <h3>Importante</h3>
                <ul>
                  <li>Llegue 10 minutos antes de su turno</li>
                  <li>Traiga documentación del vehículo</li>
                  <li>Guarde este email como comprobante</li>
                </ul>
              </div>

              ${
                plant.address
                  ? `
              <div class="info-box">
                <h3>Dirección</h3>
                <p>${plant.address}</p>
              </div>
              `
                  : ''
              }
            </div>
            
            <div class="footer">
              <p>Este es un email automático, por favor no responda.</p>
              <p>${plant.name} - Sistema de Turnos RTO</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    if (type === 'cancellation') {
      return `
        <!DOCTYPE html>
        <html>
        <head>${baseStyles}</head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Cancelación de Turno</h1>
              <p>${plant.name}</p>
            </div>
            <div class="content">
              <p>Estimado/a <strong>${detail.customerName}</strong>,</p>
              <p>Su turno ha sido <strong>cancelado</strong> exitosamente.</p>
              
              <div class="info-box">
                <h3>Datos del Turno Cancelado</h3>
                <table>
                  <tr>
                    <td class="label">Fecha:</td>
                    <td>${fecha}</td>
                  </tr>
                  <tr>
                    <td class="label">Hora:</td>
                    <td>${hora}</td>
                  </tr>
                  <tr>
                    <td class="label">Dominio:</td>
                    <td>${detail.vehicleDomain}</td>
                  </tr>
                  <tr>
                    <td class="label">N° Turno:</td>
                    <td>${appointment.id}</td>
                  </tr>
                </table>
              </div>

              <p>Si desea solicitar un nuevo turno, puede hacerlo desde nuestro sitio web.</p>
            </div>
            
            <div class="footer">
              <p>Este es un email automático, por favor no responda.</p>
              <p>${plant.name} - Sistema de Turnos RTO</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    if (type === 'reschedule') {
      return `
        <!DOCTYPE html>
        <html>
        <head>${baseStyles}</head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Reprogramación de Turno</h1>
              <p>${plant.name}</p>
            </div>
            <div class="content">
              <p>Estimado/a <strong>${detail.customerName}</strong>,</p>
              <p>Su turno ha sido <strong>reprogramado</strong> exitosamente.</p>
              
              <div class="info-box">
                <h3>Nueva Fecha y Hora</h3>
                <table>
                  <tr>
                    <td class="label">Fecha:</td>
                    <td>${fecha}</td>
                  </tr>
                  <tr>
                    <td class="label">Hora:</td>
                    <td>${hora}</td>
                  </tr>
                  <tr>
                    <td class="label">Dominio:</td>
                    <td>${detail.vehicleDomain}</td>
                  </tr>
                  <tr>
                    <td class="label">Vehículo:</td>
                    <td>${detail.vehicleType}</td>
                  </tr>
                  <tr>
                    <td class="label">N° Turno:</td>
                    <td>${appointment.id}</td>
                  </tr>
                </table>
              </div>

              <div class="info-box">
                <h3>Importante</h3>
                <ul>
                  <li>Llegue 10 minutos antes de su turno</li>
                  <li>Traiga documentación del vehículo</li>
                  <li>Guarde este email como comprobante</li>
                </ul>
              </div>
            </div>
            
            <div class="footer">
              <p>Este es un email automático, por favor no responda.</p>
              <p>${plant.name} - Sistema de Turnos RTO</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    return '';
  }
}
