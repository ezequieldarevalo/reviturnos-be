import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Plant } from '../database/entities/plant.entity';
import { User } from '../database/entities/user.entity';
import { Appointment } from '../database/entities/appointment.entity';
import { AppointmentDetail } from '../database/entities/appointment-detail.entity';
import { Payment } from '../database/entities/payment.entity';
import { InspectionLine } from '../database/entities/inspection-line.entity';
import { Pricing } from '../database/entities/pricing.entity';
import { ErrorLog } from '../database/entities/error-log.entity';
import { AdminActionLog } from '../database/entities/admin-action-log.entity';

const entities = [
  Plant,
  User,
  Appointment,
  AppointmentDetail,
  Payment,
  InspectionLine,
  Pricing,
  ErrorLog,
  AdminActionLog,
];

export const typeOrmConfigAsync: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (configService: ConfigService): Promise<DataSourceOptions> => {
    return {
      type: 'postgres',
      host: configService.get<string>('DB_HOST'),
      port: configService.get<number>('DB_PORT'),
      username: configService.get<string>('DB_USERNAME'),
      password: configService.get<string>('DB_PASSWORD'),
      database: configService.get<string>('DB_DATABASE'),
      entities,
      synchronize: configService.get<boolean>('DB_SYNCHRONIZE', false),
      logging: configService.get<boolean>('DB_LOGGING', false),
      ssl:
        configService.get<string>('NODE_ENV') === 'production'
          ? { rejectUnauthorized: false }
          : false,
    };
  },
};

// Para CLI de TypeORM
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  username: process.env.DB_USERNAME || 'reviturnos',
  password: process.env.DB_PASSWORD || 'reviturnos_password',
  database: process.env.DB_DATABASE || 'reviturnos',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});
