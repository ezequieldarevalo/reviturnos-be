import { createConnection } from 'typeorm';
import * as mysql from 'mysql2/promise';
import { Plant } from '../src/database/entities/plant.entity';

/**
 * Script de migración de configuraciones desde MySQL a PostgreSQL
 * 
 * Este script:
 * 1. Se conecta a las 5 bases de datos MySQL (una por planta)
 * 2. Lee las tablas de configuración (Day, Feriado, Franco, Config)
 * 3. Transforma los datos al nuevo formato JSONB
 * 4. Actualiza la columna `config` en la tabla `plants` de PostgreSQL
 * 
 * Uso:
 * npm run migrate:configs
 */

interface OldPlantConfig {
  days: any[];
  feriados: any[];
  francos: any[];
  config: any;
  fds: any[];
  lunes: any[];
}

// Conexión vía SSH tunnel: ssh -L 3307:localhost:3306 reviturnos@157.230.90.227
// Solo las 3 plantas en producción
const PLANTS = [
  {
    code: 'lasheras',
    mysqlHost: 'localhost', // Túnel SSH
    mysqlPort: 3307,        // Puerto local del túnel
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

const DAYS_MAP = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

async function readOldConfig(plant: typeof PLANTS[0]): Promise<OldPlantConfig> {
  console.log(`\n📖 Reading config from ${plant.code}...`);
  
  const connection = await mysql.createConnection({
    host: plant.mysqlHost,
    port: plant.mysqlPort,
    user: plant.mysqlUser,
    password: plant.mysqlPassword,
    database: plant.mysqlDatabase,
  });

  try {
    const [days] = await connection.query('SELECT * FROM days ORDER BY month');
    const [feriados] = await connection.query('SELECT * FROM feriados WHERE fecha >= CURDATE()');
    const [francos] = await connection.query('SELECT * FROM francos');
    const [config] = await connection.query('SELECT * FROM configs LIMIT 1');
    const [fds] = await connection.query('SELECT * FROM fds');
    const [lunes] = await connection.query('SELECT * FROM lunes');

    console.log(`  ✓ Days: ${(days as any[]).length} rows`);
    console.log(`  ✓ Feriados: ${(feriados as any[]).length} rows`);
    console.log(`  ✓ Francos: ${(francos as any[]).length} rows`);
    console.log(`  ✓ FDS: ${(fds as any[]).length} rows`);
    console.log(`  ✓ Lunes: ${(lunes as any[]).length} rows`);

    return {
      days: days as any[],
      feriados: feriados as any[],
      francos: francos as any[],
      config: (config as any[])[0],
      fds: fds as any[],
      lunes: lunes as any[],
    };
  } finally {
    await connection.end();
  }
}

function transformToNewFormat(oldConfig: OldPlantConfig): any {
  console.log('  🔄 Transforming to new format...');
  
  // Transformar horarios por día (del primer mes como base)
  const firstMonth = oldConfig.days[0];
  const schedules: any = {};

  for (let dayNum = 0; dayNum < 7; dayNum++) {
    const dayName = DAYS_MAP[dayNum];
    const fromKey = `${getSpanishDayName(dayNum)}_desde`;
    const toKey = `${getSpanishDayName(dayNum)}_hasta`;

    if (firstMonth[fromKey] && firstMonth[toKey]) {
      const from = formatTime(firstMonth[fromKey]);
      const to = formatTime(firstMonth[toKey]);
      
      schedules[dayName] = {
        from,
        to,
        slotsPerHour: 4, // Default, se puede ajustar según tope_por_hora de líneas
      };
    }
  }

  // Extraer feriados
  const holidays = oldConfig.feriados.map((f: any) => f.fecha);

  // Extraer días no laborables (francos)
  const nonWorkingDays = oldConfig.francos.map((f: any) => parseInt(f.dia));

  // Agregar fines de semana si están en FDS
  const fdsArray = oldConfig.fds.map((f: any) => parseInt(f.nro_dia));
  fdsArray.forEach(day => {
    if (!nonWorkingDays.includes(day)) {
      nonWorkingDays.push(day);
    }
  });

  return {
    schedules,
    holidays,
    nonWorkingDays: [...new Set(nonWorkingDays)].sort(),
    payment: {
      expirationMinutes: 120,
      cashExpirationMinutes: 2880,
      validatePendingQuotes: false,
      requiresPayment: true,
    },
    business: {
      daysAvailableInAdvance: oldConfig.config?.cant_dias_disponibles || 30,
    },
  };
}

function getSpanishDayName(dayNum: number): string {
  const names = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return names[dayNum];
}

function formatTime(time: number): string {
  // time viene como HHMM (ej: 800 = 08:00, 1530 = 15:30)
  if (!time) return '00:00';
  
  const str = time.toString().padStart(4, '0');
  const hours = str.substring(0, 2);
  const minutes = str.substring(2, 4);
  return `${hours}:${minutes}`;
}

async function updatePostgresConfig(plantCode: string, newConfig: any) {
  console.log(`  💾 Updating PostgreSQL config for ${plantCode}...`);
  
  const connection = await createConnection({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    username: process.env.DB_USERNAME || 'reviturnos_user',
    password: process.env.DB_PASSWORD || 'reviturnos_pass',
    database: process.env.DB_DATABASE || 'reviturnos_db',
    entities: [Plant],
  });

  try {
    const plantRepo = connection.getRepository(Plant);
    const plant = await plantRepo.findOne({ where: { code: plantCode } as any });

    if (!plant) {
      throw new Error(`Plant ${plantCode} not found in PostgreSQL`);
    }

    // Merge con config existente (preservar integraciones, etc)
    plant.config = {
      ...plant.config,
      ...newConfig,
    };

    await plantRepo.save(plant);
    console.log(`  ✅ Config updated for ${plantCode}`);
  } finally {
    await connection.close();
  }
}

async function main() {
  console.log('🚀 Starting configuration migration...\n');
  console.log('This will:');
  console.log('  1. Read old configs from MySQL databases');
  console.log('  2. Transform to new JSONB format');
  console.log('  3. Update PostgreSQL plants table\n');

  for (const plant of PLANTS) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${plant.code.toUpperCase()}`);
      console.log('='.repeat(60));

      // 1. Leer configuración vieja
      const oldConfig = await readOldConfig(plant);

      // 2. Transformar
      const newConfig = transformToNewFormat(oldConfig);
      
      console.log('\n  📊 New config preview:');
      console.log('  Schedules:', Object.keys(newConfig.schedules).length, 'days configured');
      console.log('  Holidays:', newConfig.holidays.length, 'holidays');
      console.log('  Non-working days:', newConfig.nonWorkingDays);

      // 3. Actualizar PostgreSQL
      await updatePostgresConfig(plant.code, newConfig);

    } catch (error) {
      console.error(`\n❌ Error processing ${plant.code}:`, error.message);
      console.error(error.stack);
    }
  }

  console.log('\n✅ Migration completed!');
  process.exit(0);
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
