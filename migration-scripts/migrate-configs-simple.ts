import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';

/**
 * Script simplificado de migración de configuraciones
 * No usa las entidades de NestJS, solo TypeORM directo
 */

// Conexión vía SSH tunnel: ssh -L 3307:localhost:3306 reviturnos@157.230.90.227
const PLANTS = [
  {
    code: 'lasheras',
    mysqlHost: 'localhost',
    mysqlPort: 3307,
    mysqlUser: 'adminlhrevitotal',
    mysqlPassword: 'YnWL@fdA6fRk3@xI6VGM3K',
    mysqlDatabase: 'lhrevitotal',
  },
  {
    code: 'maipu',
    mysqlHost: 'localhost',
    mysqlPort: 3307,
    mysqlUser: 'adminmarevitotal',
    mysqlPassword: 't4nx31Fm]ha-i{NITBtM',
    mysqlDatabase: 'marevitotal',
  },
  {
    code: 'godoycruz',
    mysqlHost: 'localhost',
    mysqlPort: 3307,
    mysqlUser: 'adminrtogc',
    mysqlPassword: 'vq:oaDyHYKG2Gf+xWI5%',
    mysqlDatabase: 'rtogc',
  },
];

const DAYS_MAP: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

const SPANISH_DAYS: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
  0: 'domingo',
};

function formatTime(value: number): string {
  if (!value || value === 0) return null;
  const str = value.toString().padStart(2, '0');
  return `${str}:00`;
}

async function readOldConfig(plant: typeof PLANTS[0]) {
  console.log(`\n📖 Reading config from ${plant.code}...`);
  
  const connection = await mysql.createConnection({
    host: plant.mysqlHost,
    port: plant.mysqlPort,
    user: plant.mysqlUser,
    password: plant.mysqlPassword,
    database: plant.mysqlDatabase,
  });

  try {
    const [days] = await connection.query('SELECT * FROM days LIMIT 1');
    const [feriados] = await connection.query('SELECT fecha FROM feriados WHERE fecha >= CURDATE()');
    const [francos] = await connection.query('SELECT dia FROM francos');
    const [configs] = await connection.query('SELECT * FROM configs LIMIT 1');
    
    let fds: any[] = [];
    let lunes: any[] = [];
    
    try {
      const [fdsRows] = await connection.query('SELECT nro_dia FROM fds');
      fds = fdsRows as any[];
    } catch (e) {
      console.log('  ⚠️  Tabla fds no encontrada');
    }
    
    try {
      const [lunesRows] = await connection.query('SELECT fecha FROM lunes WHERE fecha >= CURDATE()');
      lunes = lunesRows as any[];
    } catch (e) {
      console.log('  ⚠️  Tabla lunes no encontrada');
    }

    console.log(`  ✓ Days: ${(days as any[]).length} rows`);
    console.log(`  ✓ Feriados: ${(feriados as any[]).length} rows`);
    console.log(`  ✓ Francos: ${(francos as any[]).length} rows`);
    console.log(`  ✓ FDS: ${(fds as any[]).length} rows`);
    console.log(`  ✓ Lunes: ${(lunes as any[]).length} rows`);

    return {
      day: (days as any[])[0],
      feriados: feriados as any[],
      francos: francos as any[],
      config: (configs as any[])[0],
      fds: fds as any[],
      lunes: lunes as any[],
    };
  } finally {
    await connection.end();
  }
}

function transformToNewFormat(oldConfig: any): any {
  console.log('  🔄 Transforming to new format...');
  
  const day = oldConfig.day;
  const schedules: any = {};

  // Mapear horarios por día
  for (let dayNum = 0; dayNum < 7; dayNum++) {
    const dayName = DAYS_MAP[dayNum];
    const spanishDay = SPANISH_DAYS[dayNum];
    const fromKey = `${spanishDay}_desde`;
    const toKey = `${spanishDay}_hasta`;

    const from = day[fromKey];
    const to = day[toKey];

    if (from && to && from !== 0 && to !== 0) {
      schedules[dayName] = {
        from: formatTime(from),
        to: formatTime(to),
        slotsPerHour: 4,
      };
    }
  }

  // Extraer feriados
  const holidays = oldConfig.feriados.map((f: any) => f.fecha);

  // Extraer días no laborables (francos)
  const nonWorkingDays = oldConfig.francos.map((f: any) => parseInt(f.dia));

  // Agregar fines de semana laborables desde FDS
  const fdsArray = oldConfig.fds.map((f: any) => parseInt(f.nro_dia));
  
  // Agregar lunes no laborables
  const lunesDays = oldConfig.lunes.map((l: any) => l.fecha);

  // Configuración SMTP
  const config = oldConfig.config || {};

  return {
    schedules,
    holidays: [...holidays, ...lunesDays],
    nonWorkingDays: [...new Set(nonWorkingDays)].sort(),
    payment: {
      expirationMinutes: 120,
      cashExpirationMinutes: 2880,
      marginPostCashPaymentMinutes: 120,
      validatePendingQuotes: false,
      requiresPayment: true,
    },
    integrations: {
      mercadopago: {
        enabled: true,
        excludedPaymentMethods: [],
      },
      rto: {
        enabled: false,
        confirmQuotes: false,
      },
    },
    smtp: {
      host: config.server_mail || 'smtp.gmail.com',
      port: parseInt(config.port_mail) || 587,
      secure: false,
      user: config.user_mail || '',
      password: config.pass_mail || '',
      fromEmail: config.user_mail || '',
      fromName: config.denominacion || 'Reviturnos',
    },
    contact: {
      phone: config.telefono || '',
      address: config.direccion || '',
      email: config.user_mail || '',
    },
  };
}

async function main() {
  console.log('\n🔄 MIGRACIÓN DE CONFIGURACIONES\n');

  // Conectar a PostgreSQL local
  const pgDataSource = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5433,
    username: 'reviturnos',
    password: 'reviturnos_password_2026',
    database: 'reviturnos',
    synchronize: false,
  });

  await pgDataSource.initialize();
  console.log('✅ Connected to PostgreSQL\n');

  try {
    for (const plant of PLANTS) {
      console.log(`${'='.repeat(60)}`);
      console.log(`Processing: ${plant.code.toUpperCase()}`);
      console.log('='.repeat(60));

      // Leer configuración vieja
      const oldConfig = await readOldConfig(plant);

      // Transformar al nuevo formato
      const newConfig = transformToNewFormat(oldConfig);

      // Actualizar en PostgreSQL
      await pgDataSource.query(
        `UPDATE plants SET config = $1 WHERE code = $2`,
        [JSON.stringify(newConfig), plant.code]
      );

      console.log(`  ✅ Configuration migrated for ${plant.code}\n`);
    }

    console.log('='.repeat(60));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));

  } finally {
    await pgDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
