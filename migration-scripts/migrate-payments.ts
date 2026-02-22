import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';

/**
 * Script para migrar pagos de turnos ya migrados
 */

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

async function migratePaymentsForPlant(
  plant: typeof PLANTS[0],
  pgConnection: DataSource,
) {
  console.log(`\n📖 Reading payments from ${plant.code}...`);

  const mysqlConn = await mysql.createConnection({
    host: plant.mysqlHost,
    port: plant.mysqlPort,
    user: plant.mysqlUser,
    password: plant.mysqlPassword,
    database: plant.mysqlDatabase,
  });

  try {
    const plantRows: any[] = await pgConnection.query(
      `SELECT id FROM plants WHERE code = $1`,
      [plant.code]
    );

    if (!plantRows || plantRows.length === 0) {
      console.log(`  ❌ Plant ${plant.code} not found`);
      return { migrated: 0, skipped: 0 };
    }

    const postgresPlantId = plantRows[0].id;

    // Obtener appointments ya migrados en PostgreSQL
    const appointmentsMap: Record<string, number> = {};
    const pgAppointments: any[] = await pgConnection.query(
      `SELECT id, "appointmentDate", "appointmentTime", "lineId" 
       FROM appointments 
       WHERE "plantId" = $1`,
      [postgresPlantId]
    );

    console.log(`  ✓ Found ${pgAppointments.length} appointments in PostgreSQL`);

    // Crear mapa de appointments por fecha+hora
    for (const apt of pgAppointments) {
      const fecha = apt.appointmentDate instanceof Date
        ? apt.appointmentDate.toISOString().split('T')[0]
        : new Date(apt.appointmentDate).toISOString().split('T')[0];
      // appointmentTime puede ser HH:MM:SS o HH:MM
      const time = apt.appointmentTime.substring(0, 5); // Tomar solo HH:MM
      const key = `${fecha}_${time}`;
      // Si hay múltiples appointments con misma fecha/hora, guardar el primero
      if (!appointmentsMap[key]) {
        appointmentsMap[key] = apt.id;
      }
    }

    // Obtener pagos desde MySQL (desde 2025)
    const [pagos] = await mysqlConn.query(`
      SELECT 
        c.*,
        t.fecha,
        t.hora
      FROM cobros c
      INNER JOIN turnos t ON t.id = c.id_turno
      WHERE t.estado IN ('P', 'C', 'T')
        AND t.fecha >= '2025-01-01'
      ORDER BY c.fecha DESC
    `);

    console.log(`  ✓ Found ${(pagos as any[]).length} payments in MySQL`);

    if ((pagos as any[]).length === 0) {
      return { migrated: 0, skipped: 0 };
    }

    let migrated = 0;
    let skipped = 0;

    for (const pago of pagos as any[]) {
      try {
        // Formatear hora - puede venir como TIME '08:00:00' o como número
        let hora = '00:00';
        if (typeof pago.hora === 'string') {
          // Ya viene en formato HH:MM:SS, tomamos HH:MM
          hora = pago.hora.substring(0, 5);
        } else if (typeof pago.hora === 'number') {
          // Viene como número 80000
          const horaNum = parseInt(pago.hora.toString());
          const horas = Math.floor(horaNum / 10000);
          const minutos = Math.floor((horaNum % 10000) / 100);
          hora = `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
        }
        
        // Formatear fecha (YYYY-MM-DD)
        const fecha = pago.fecha instanceof Date 
          ? pago.fecha.toISOString().split('T')[0]
          : new Date(pago.fecha).toISOString().split('T')[0];
        
        // Buscar appointment en PostgreSQL
        const key = `${fecha}_${hora}`;
        const appointmentId = appointmentsMap[key];

        if (!appointmentId) {
          console.log(`  ⚠️  No appointment found for ${fecha} ${hora} (key: ${key})`);
          skipped++;
          continue;
        }

        // Verificar si ya existe el pago
        const existingPayment: any[] = await pgConnection.query(
          `SELECT id FROM payments WHERE "appointmentId" = $1`,
          [appointmentId]
        );

        if (existingPayment && existingPayment.length > 0) {
          skipped++;
          continue;
        }

        // Mapear método de pago
        let method = 'cash';
        let platform = null;
        
        if (pago.metodo) {
          const metodo = pago.metodo.toLowerCase();
          if (metodo.includes('mercado') || metodo.includes('mp')) {
            method = 'mercadopago';
            platform = 'mercadopago';
          } else if (metodo.includes('efectivo') || metodo.includes('cash')) {
            method = 'cash';
          } else if (metodo.includes('transfer')) {
            method = 'transfer';
          } else {
            // Para tarjetas (Visa, Master, etc)
            method = 'card';
            platform = pago.origen || 'yacare';
          }
        }

        // Parsear fecha (viene como timestamp string o fecha)
        let paymentDate = new Date();
        if (pago.fecha) {
          paymentDate = new Date(pago.fecha);
        }

        // Insertar pago
        await pgConnection.query(
          `INSERT INTO payments (
            "appointmentId", "paymentDate", amount, currency,
            method, platform, "transactionId", reference,
            status, origin, "externalPaymentId", metadata, "createdAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            appointmentId,
            paymentDate,
            pago.monto || 0,
            'ARS',
            method,
            platform,
            null, // transactionId (no hay en MySQL)
            pago.nro_op || null,
            'approved',
            'T', // origin web
            pago.id_cobro || null,
            JSON.stringify({
              metodo_original: pago.metodo,
              origen_original: pago.origen,
            }),
            paymentDate,
          ]
        );

        migrated++;

        if (migrated % 10 === 0) {
          console.log(`  ... migrated ${migrated} payments`);
        }

      } catch (error) {
        console.error(`  ❌ Error migrating payment ${pago.id}:`, error.message);
        skipped++;
      }
    }

    console.log(`  ✅ ${plant.code}: ${migrated} payments migrated, ${skipped} skipped`);
    return { migrated, skipped };

  } finally {
    await mysqlConn.end();
  }
}

async function main() {
  console.log('\n💰 MIGRACIÓN DE PAGOS\n');

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
    let totalMigrated = 0;
    let totalSkipped = 0;

    for (const plant of PLANTS) {
      console.log(`${'='.repeat(60)}`);
      console.log(`Processing: ${plant.code.toUpperCase()}`);
      console.log('='.repeat(60));

      const result = await migratePaymentsForPlant(plant, pgDataSource);
      totalMigrated += result.migrated;
      totalSkipped += result.skipped;
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION COMPLETED');
    console.log(`Total migrated: ${totalMigrated}`);
    console.log(`Total skipped: ${totalSkipped}`);
    console.log('='.repeat(60));

  } finally {
    await pgDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
