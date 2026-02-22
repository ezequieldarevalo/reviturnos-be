import { DataSource } from 'typeorm';
import { Plant } from '../entities/plant.entity';
import { Pricing } from '../entities/pricing.entity';
import { InspectionLine } from '../entities/inspection-line.entity';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { UserRole } from '../../common/constants';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5433,
  username: process.env.DB_USERNAME || 'reviturnos',
  password: process.env.DB_PASSWORD || 'reviturnos_password_2026',
  database: process.env.DB_DATABASE || 'reviturnos',
  entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
  synchronize: true,
});

async function seed() {
  await AppDataSource.initialize();
  console.log('🌱 Starting database seeding...');

  const plantRepo = AppDataSource.getRepository(Plant);
  const pricingRepo = AppDataSource.getRepository(Pricing);
  const userRepo = AppDataSource.getRepository(User);

  // Crear plantas
  const plants = [
    {
      code: 'lasheras',
      name: 'Revitotal - Las Heras',
      slug: 'lasheras',
      config: {
        schedules: {
          monday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          tuesday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          wednesday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          thursday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          friday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          saturday: { from: '08:00', to: '13:00', slotsPerHour: 2 },
        },
        holidays: ['2026-01-01', '2026-05-01', '2026-05-25', '2026-07-09', '2026-12-25'],
        nonWorkingDays: [0], // Domingo
        payment: {
          expirationMinutes: 120,
          cashExpirationMinutes: 2880,
          marginPostCashPaymentMinutes: 120,
          validatePendingQuotes: false,
          requiresPayment: true,
        },
        business: {
          ignoreVehicleLines: true,
          daysAvailableInAdvance: 30,
        },
        integrations: {
          mercadopago: { enabled: true },
          rto: { enabled: true, confirmQuotes: false },
        },
      },
      mpToken: 'APP_USR-6052037114701095-070315-b73b3e7050af8abf13c0f7f9f1e136d3-724245834',
      mpNotifUrl: 'https://lhrevitotal.reviturnos.com.ar/api/auth/notifMeli',
      mpRedirectUrl: 'https://turnos.reviturnos.com.ar/confirmed/lasheras',
      emailFrom: 'turnoslasheras@revitotal.com.ar',
      emailFromName: 'Revitotal - Las Heras',
      smtpHost: 'smtp.hostinger.com.ar',
      smtpPort: 587,
      smtpUser: 'turnoslasheras@revitotal.com.ar',
      smtpPassword: '2XmAo1U!',
      smtpEncryption: 'tls',
    },
    {
      code: 'maipu',
      name: 'Revitotal - Maipú',
      slug: 'maipu',
      config: {
        payment: {
          expirationMinutes: 120,
          cashExpirationMinutes: 2880,
          marginPostCashPaymentMinutes: 120,
          validatePendingQuotes: false,
          requiresPayment: true,
        },
        business: {
          ignoreVehicleLines: true,
          maxDaysAvailable: 30,
        },
        integrations: {
          yacare: { enabled: true },
          mercadopago: { enabled: true },
          rto: { enabled: true, confirmQuotes: false },
        },
      },
    },
    {
      code: 'godoycruz',
      name: 'Godoy Cruz',
      slug: 'godoycruz',
      config: {
        schedules: {
          monday: { from: '07:30', to: '16:00', slotsPerHour: 4 },
          tuesday: { from: '07:30', to: '16:00', slotsPerHour: 4 },
          wednesday: { from: '07:30', to: '16:00', slotsPerHour: 4 },
          thursday: { from: '07:30', to: '16:00', slotsPerHour: 4 },
          friday: { from: '07:30', to: '16:00', slotsPerHour: 4 },
        },
        holidays: ['2026-01-01', '2026-05-01', '2026-05-25', '2026-07-09', '2026-12-25'],
        nonWorkingDays: [0, 6],
        payment: {
          expirationMinutes: 120,
          validatePendingQuotes: false,
          requiresPayment: true,
        },
        business: {
          ignoreVehicleLines: false,
          daysAvailableInAdvance: 30,
        },
        integrations: {
          mercadopago: { enabled: false },
          rto: { enabled: true, confirmQuotes: false },
        },
      },
    },
    {
      code: 'rivadavia',
      name: 'Rivadavia',
      slug: 'rivadavia',
      config: {
        schedules: {
          monday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          tuesday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          wednesday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          thursday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          friday: { from: '08:00', to: '17:00', slotsPerHour: 4 },
          saturday: { from: '08:00', to: '12:00', slotsPerHour: 2 },
        },
        holidays: ['2026-01-01', '2026-05-01', '2026-05-25', '2026-07-09', '2026-12-25'],
        nonWorkingDays: [0],
        payment: {
          expirationMinutes: 120,
          validatePendingQuotes: false,
          requiresPayment: true,
        },
        business: {
          ignoreVehicleLines: false,
          daysAvailableInAdvance: 30,
        },
        integrations: {
          mercadopago: { enabled: false },
          rto: { enabled: true, confirmQuotes: false },
        },
      },
    },
    {
      code: 'sanmartin',
      name: 'San Martín - Mendoza',
      slug: 'sanmartin',
      config: {
        schedules: {
          monday: { from: '08:00', to: '13:00', slotsPerHour: 3 },
          tuesday: { from: '08:00', to: '13:00', slotsPerHour: 3 },
          wednesday: { from: '08:00', to: '13:00', slotsPerHour: 3 },
          thursday: { from: '08:00', to: '13:00', slotsPerHour: 3 },
          friday: { from: '08:00', to: '13:00', slotsPerHour: 3 },
          saturday: { from: '08:00', to: '13:00', slotsPerHour: 2 },
        },
        holidays: ['2026-01-01', '2026-05-01', '2026-05-25', '2026-07-09', '2026-12-25'],
        nonWorkingDays: [0],
        payment: {
          requiresPayment: false,
        },
        business: {
          ignoreVehicleLines: false,
          daysAvailableInAdvance: 30,
        },
        integrations: {
          mercadopago: { enabled: false },
          rto: { enabled: true, confirmQuotes: false },
        },
      },
    },
  ];

  console.log('📍 Creating plants...');
  for (const plantData of plants) {
    const existing = await plantRepo.findOne({ where: { code: plantData.code } });
    if (!existing) {
      const plant = plantRepo.create(plantData);
      await plantRepo.save(plant);
      console.log(`  ✓ Created plant: ${plantData.name}`);
    } else {
      // Actualizar config de planta existente
      plantRepo.merge(existing, plantData);
      await plantRepo.save(existing);
      console.log(`  ✓ Updated plant config: ${plantData.name}`);
    }
  }

  // Crear precios por planta
  console.log('💰 Creating pricing...');
  const vehicleTypes = [
    { type: 'AUTO PARTICULAR', price: 8500 },
    { type: 'MOTO HASTA 300 CC', price: 5000 },
    { type: 'MOTO MAS DE 300 CC', price: 5500 },
    { type: 'CAMIONETA PARTICULAR', price: 9500 },
  ];

  const allPlants = await plantRepo.find();
  for (const plant of allPlants) {
    for (const vt of vehicleTypes) {
      const existing = await pricingRepo.findOne({
        where: {
          plantId: plant.id,
          vehicleType: vt.type,
        },
      });

      if (!existing) {
        const pricing = pricingRepo.create({
          plantId: plant.id,
          vehicleType: vt.type,
          description: vt.type,
          price: vt.price,
          currency: 'ARS',
          validFrom: new Date(),
        });
        await pricingRepo.save(pricing);
        console.log(`  ✓ Created pricing: ${plant.code} - ${vt.type}`);
      }
    }
  }

  // Crear líneas de inspección por planta
  console.log('🔧 Creating inspection lines...');
  const lineRepo = AppDataSource.getRepository(InspectionLine);
  for (const plant of allPlants) {
    // Crear una línea por cada tipo de vehículo
    for (const vt of vehicleTypes) {
      const existing = await lineRepo.findOne({
        where: {
          plantId: plant.id,
          vehicleType: vt.type,
        },
      });

      if (!existing) {
        const line = lineRepo.create({
          plantId: plant.id,
          name: `Línea ${vt.type}`,
          vehicleType: vt.type,
          maxAppointmentsPerHour: 4,
          maxDaysAvailable: 30,
          active: true,
        });
        await lineRepo.save(line);
        console.log(`  ✓ Created line for ${plant.code} - ${vt.type}`);
      }
    }
  }

  // Crear usuarios admin por planta
  console.log('👤 Creating admin users...');
  for (const plant of allPlants) {
    const email = `admin@${plant.code}.com`;
    const existing = await userRepo.findOne({ where: { email } });

    if (!existing) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      const user = userRepo.create({
        plantId: plant.id,
        email,
        passwordHash,
        name: `Admin ${plant.name}`,
        role: UserRole.ADMIN,
        active: true,
      });
      await userRepo.save(user);
      console.log(`  ✓ Created user: ${email} (password: admin123)`);
    } else {
      console.log(`  - User already exists: ${email}`);
    }
  }

  console.log('✅ Seeding completed!');
  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
});
