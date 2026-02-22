import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { User } from '@/database/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { Plant } from '@/database/entities/plant.entity';
import { UserRole } from '@/common/constants';
import { StartOnboardingDto } from './dto/start-onboarding.dto';
import { Pricing } from '@/database/entities/pricing.entity';
import { InspectionLine } from '@/database/entities/inspection-line.entity';
import { EmailService } from '../email/email.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { TestMercadoPagoDto } from './dto/test-mercadopago.dto';
import { TestEmailDto } from './dto/test-email.dto';
import { decryptSecret, encryptSecret, maskSecret } from '@/common/utils/secret-crypto.util';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Plant)
    private plantRepository: Repository<Plant>,
    private dataSource: DataSource,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  private readonly defaultVehicleTypes = [
    { type: 'AUTO PARTICULAR', price: 8500 },
    { type: 'MOTO HASTA 300 CC', price: 5000 },
    { type: 'MOTO MAS DE 300 CC', price: 5500 },
    { type: 'CAMIONETA PARTICULAR', price: 9500 },
  ];

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user || !user.active) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const payload = { email: user.email, sub: user.id, role: user.role };

    return {
      access_token: this.jwtService.sign(payload),
      token_type: 'Bearer',
      expires_in: 31536000, // 1 year in seconds
    };
  }

  async validateToken(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['plant'],
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }

  async signup(plant: Plant, dto: SignupDto) {
    const exists = await this.userRepository.findOne({ where: { email: dto.email } });
    if (exists) {
      return { message: 'User already exists' };
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      plantId: plant.id,
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: UserRole.OPERATOR,
      active: true,
    });

    await this.userRepository.save(user);
    return { message: 'Successfully created user!' };
  }

  async startOnboarding(dto: StartOnboardingDto) {
    const plantCode = dto.plantCode.trim().toLowerCase();
    const adminEmail = dto.adminEmail.trim().toLowerCase();

    const [plantExists, userExists] = await Promise.all([
      this.plantRepository.findOne({ where: { code: plantCode } }),
      this.userRepository.findOne({ where: { email: adminEmail } }),
    ]);

    if (plantExists) {
      throw new BadRequestException('Plant code already exists');
    }

    if (userExists) {
      throw new BadRequestException('Admin email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    const result = await this.dataSource.transaction(async (manager) => {
      const plant = manager.create(Plant, {
        code: plantCode,
        slug: plantCode,
        name: dto.plantName.trim(),
        address: dto.address?.trim() || null,
        active: true,
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
          onboarding: {
            status: 'pending_verification',
            startedAt: new Date().toISOString(),
          },
        },
      });

      await manager.save(plant);

      for (const vt of this.defaultVehicleTypes) {
        await manager.save(
          manager.create(Pricing, {
            plantId: plant.id,
            vehicleType: vt.type,
            description: vt.type,
            price: vt.price,
            currency: 'ARS',
            validFrom: new Date(),
          }),
        );

        await manager.save(
          manager.create(InspectionLine, {
            plantId: plant.id,
            name: `Línea ${vt.type}`,
            vehicleType: vt.type,
            maxAppointmentsPerHour: 4,
            maxDaysAvailable: 30,
            active: true,
          }),
        );
      }

      const adminUser = manager.create(User, {
        plantId: plant.id,
        name: dto.adminName.trim(),
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        active: true,
      });

      await manager.save(adminUser);
      return { plant, adminUser };
    });

    const payload = {
      email: result.adminUser.email,
      sub: result.adminUser.id,
      role: result.adminUser.role,
    };

    return {
      message: 'Onboarding started successfully',
      plant: {
        id: result.plant.id,
        code: result.plant.code,
        name: result.plant.name,
      },
      access_token: this.jwtService.sign(payload),
      token_type: 'Bearer',
      expires_in: 31536000,
    };
  }

  private assertAdminUser(user: User) {
    if (!user?.active) {
      throw new UnauthorizedException('User not found or inactive');
    }
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin role required');
    }
  }

  private getEncryptionKey(): string {
    const key =
      this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY') ||
      this.configService.get<string>('JWT_SECRET');
    if (!key) throw new BadRequestException('Encryption key is not configured');
    return key;
  }

  private decryptIfNeeded(value?: string | null): string {
    if (!value) return '';
    return decryptSecret(value, this.getEncryptionKey());
  }

  private async getPlantForUser(user: User): Promise<Plant> {
    const plant = await this.plantRepository.findOne({ where: { id: user.plantId } });
    if (!plant) {
      throw new BadRequestException('Plant not found for user');
    }
    return plant;
  }

  async getOnboardingStatus(user: User) {
    this.assertAdminUser(user);
    const plant = await this.getPlantForUser(user);

    const onboarding = (plant.config as any)?.onboarding || {};
    const paymentCfg = (plant.config as any)?.payment || {};
    const mpCfg = (plant.config as any)?.integrations?.mercadopago || {};

    return {
      plant: {
        id: plant.id,
        code: plant.code,
        name: plant.name,
      },
      onboarding: {
        status: onboarding.status || 'pending_verification',
        startedAt: onboarding.startedAt || null,
        completedAt: onboarding.completedAt || null,
      },
      payment: {
        requiresPayment: paymentCfg.requiresPayment ?? true,
        mercadopagoEnabled: mpCfg.enabled ?? false,
        tokenConfigured: !!plant.mpToken,
        tokenMasked: maskSecret(plant.mpToken),
      },
      email: {
        smtpConfigured: !!(plant.smtpHost && plant.smtpUser && plant.smtpPassword),
        smtpHost: plant.smtpHost || null,
        smtpPort: plant.smtpPort || null,
        smtpUser: plant.smtpUser || null,
        from: plant.emailFrom || null,
      },
    };
  }

  async completeOnboarding(user: User, dto: CompleteOnboardingDto) {
    this.assertAdminUser(user);
    const plant = await this.getPlantForUser(user);

    const cfg: any = plant.config || {};
    cfg.payment = cfg.payment || {};
    cfg.integrations = cfg.integrations || {};
    cfg.integrations.mercadopago = cfg.integrations.mercadopago || {
      enabled: false,
      excludedPaymentMethods: [],
    };
    cfg.onboarding = cfg.onboarding || { status: 'pending_verification' };

    if (dto.requiresPayment !== undefined) {
      cfg.payment.requiresPayment = dto.requiresPayment;
    }

    if (dto.mercadopagoEnabled !== undefined) {
      cfg.integrations.mercadopago.enabled = dto.mercadopagoEnabled;
    }

    if (dto.mercadopagoExcludedPaymentMethods !== undefined) {
      cfg.integrations.mercadopago.excludedPaymentMethods = dto.mercadopagoExcludedPaymentMethods;
    }

    if (dto.mercadopagoAccessToken) {
      plant.mpToken = encryptSecret(dto.mercadopagoAccessToken.trim(), this.getEncryptionKey());
    }
    if (dto.mercadopagoNotifUrl !== undefined) {
      plant.mpNotifUrl = dto.mercadopagoNotifUrl?.trim() || null;
    }
    if (dto.mercadopagoRedirectUrl !== undefined) {
      plant.mpRedirectUrl = dto.mercadopagoRedirectUrl?.trim() || null;
    }

    if (dto.emailFrom !== undefined) plant.emailFrom = dto.emailFrom?.trim() || null;
    if (dto.emailFromName !== undefined) plant.emailFromName = dto.emailFromName?.trim() || null;
    if (dto.smtpHost !== undefined) plant.smtpHost = dto.smtpHost?.trim() || null;
    if (dto.smtpPort !== undefined) plant.smtpPort = dto.smtpPort;
    if (dto.smtpUser !== undefined) plant.smtpUser = dto.smtpUser?.trim() || null;
    if (dto.smtpPassword) {
      plant.smtpPassword = encryptSecret(dto.smtpPassword.trim(), this.getEncryptionKey());
    }
    if (dto.smtpEncryption !== undefined) {
      plant.smtpEncryption = dto.smtpEncryption === 'none' ? null : dto.smtpEncryption;
    }

    cfg.onboarding.status = 'active';
    cfg.onboarding.completedAt = new Date().toISOString();
    plant.config = cfg;

    await this.plantRepository.save(plant);

    return {
      success: true,
      message: 'Onboarding completed successfully',
      plant: {
        id: plant.id,
        code: plant.code,
        name: plant.name,
      },
      payment: {
        requiresPayment: cfg.payment.requiresPayment ?? true,
        mercadopagoEnabled: cfg.integrations.mercadopago.enabled ?? false,
        tokenConfigured: !!plant.mpToken,
      },
      email: {
        smtpConfigured: !!(plant.smtpHost && plant.smtpUser && plant.smtpPassword),
      },
    };
  }

  async testMercadoPago(user: User, dto: TestMercadoPagoDto) {
    this.assertAdminUser(user);
    const plant = await this.getPlantForUser(user);

    const token = dto.accessToken?.trim() || this.decryptIfNeeded(plant.mpToken);
    if (!token) {
      throw new BadRequestException('MercadoPago access token is required');
    }

    try {
      const response = await axios.get('https://api.mercadopago.com/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      return {
        success: true,
        account: {
          id: response.data?.id,
          nickname: response.data?.nickname,
          email: response.data?.email,
          country: response.data?.site_id,
        },
      };
    } catch (error) {
      throw new BadRequestException('MercadoPago credentials are invalid');
    }
  }

  async testEmail(user: User, dto: TestEmailDto) {
    this.assertAdminUser(user);
    const plant = await this.getPlantForUser(user);

    const to = dto.to || user.email;
    const sent = await this.emailService.sendTestEmail(plant, to);

    if (!sent) {
      throw new BadRequestException('SMTP test failed');
    }

    return {
      success: true,
      message: `Test email sent to ${to}`,
    };
  }
}
