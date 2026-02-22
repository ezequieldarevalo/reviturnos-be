import { createConnection } from 'typeorm';
import * as mysql from 'mysql2/promise';
import { Appointment } from '../src/database/entities/appointment.entity';
import { AppointmentDetail } from '../src/database/entities/appointment-detail.entity';
import { Payment } from '../src/database/entities/payment.entity';
import { Plant } from '../src/database/entities/plant.entity';

/**
 * Script de migración de turnos RESERVADOS desde MySQL a PostgreSQL
 * 
 * Este script:
 * 1. Se conecta a las 5 bases de datos MySQL (una por planta)
 * 2. Lee SOLO turnos con estado P (Pendiente), C (Confirmado), T (Reservado temporalmente)
 * 3. Lee los detalles asociados (datosturnos)
 * 4. Lee los pagos asociados (cobros)
 * 5. Crea los registros en PostgreSQL
 * 
 * NO migra:
 * - Turnos con estado "D" (Disponibles) - se generan dinámicamente
 * - Turnos pasados
 * 
 * Uso:
 * npm run migrate:appointments
 */

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

function mapStatus(oldStatus: string): string {
  switch (oldStatus) {
    case 'P': return 'pending';
    case 'C': return 'confirmed';
    case 'T': return 'reserved';
    default: return 'available';
  }
}

function formatTime(hora: number): string {
  // hora viene como HHMM (ej: 80000 = 08:00:00, 153000 = 15:30:00)
  const str = hora.toString().padStart(6, '0');
  const hours = str.substring(0, 2);
  const minutes = str.substring(2, 4);
  return `${hours}:${minutes}`;
}

async function migrateAppointmentsForPlant(
  plant: typeof PLANTS[0],
  postgresPlantId: string,
  pgConnection: any,
) {
  console.log(`\n📖 Reading appointments from ${plant.code}...`);

  const mysqlConn = await mysql.createConnection({
    host: plant.mysqlHost,
    port: plant.mysqlPort,
    user: plant.mysqlUser,
    password: plant.mysqlPassword,
    database: plant.mysqlDatabase,
  });

  try {
    // 1. Obtener turnos reservados/confirmados FUTUROS
    const [turnos] = await mysqlConn.query(`
      SELECT 
        t.*,
        l.tipo_vehiculo,
        l.id as linea_id
      FROM turnos t
      LEFT JOIN lineas l ON l.id = t.id_linea
      WHERE t.estado IN ('P', 'C', 'T')
        AND t.fecha >= CURDATE()
      ORDER BY t.fecha, t.hora
    `);

    console.log(`  ✓ Found ${(turnos as any[]).length} appointments to migrate`);

    if ((turnos as any[]).length === 0) {
      console.log(`  ℹ️  No appointments to migrate for ${plant.code}`);
      return { migrated: 0, skipped: 0 };
    }

    const appointmentRepo = pgConnection.getRepository(Appointment);
    const detailRepo = pgConnection.getRepository(AppointmentDetail);
    const paymentRepo = pgConnection.getRepository(Payment);

    let migrated = 0;
    let skipped = 0;

    for (const turno of turnos as any[]) {
      try {
        // Verificar si ya existe
        const existing = await appointmentRepo.findOne({
          where: {
            plantId: postgresPlantId,
            appointmentDate: turno.fecha,
            appointmentTime: formatTime(turno.hora),
            lineId: turno.id_linea?.toString(),
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // 2. Crear appointment
        const appointment = appointmentRepo.create({
          plantId: postgresPlantId,
          lineId: turno.id_linea?.toString(),
          appointmentDate: turno.fecha,
          appointmentTime: formatTime(turno.hora),
          status: mapStatus(turno.estado),
          origin: turno.origen === 'A' ? 'admin' : 'web',
          reservedAt: turno.estado !== 'D' ? new Date(turno.fecha) : null,
          observations: turno.observaciones,
        });

        await appointmentRepo.save(appointment);

        // 3. Buscar detalles del turno
        const [details] = await mysqlConn.query(`
          SELECT * FROM datosturnos WHERE id_turno = ?
        `, [turno.id]);

        if ((details as any[]).length > 0) {
          const detalle = (details as any[])[0];

          const appointmentDetail = detailRepo.create({
            appointmentId: appointment.id,
            customerName: detalle.nombre || '',
            customerEmail: detalle.email || '',
            customerPhone: detalle.telefono || '',
            vehicleDomain: detalle.dominio || '',
            vehicleType: turno.tipo_vehiculo || '',
            vehicleYear: parseInt(detalle.anio) || new Date().getFullYear(),
            vehicleFuel: detalle.combustible || '',
            price: 0, // Se puede calcular luego
          });

          await detailRepo.save(appointmentDetail);
        }

        // 4. Buscar pagos asociados
        const [pagos] = await mysqlConn.query(`
          SELECT * FROM cobros WHERE id_turno = ?
        `, [turno.id]);

        if ((pagos as any[]).length > 0) {
          const pago = (pagos as any[])[0];

          const payment = paymentRepo.create({
            appointmentId: appointment.id,
            plantId: postgresPlantId,
            provider: pago.plataforma_pago || 'mercadopago',
            externalId: pago.id_cobro_externo || null,
            amount: parseFloat(pago.monto) || 0,
            status: pago.estado_pago || 'pending',
            paidAt: pago.fecha_pago ? new Date(pago.fecha_pago) : null,
          });

          await paymentRepo.save(payment);
        }

        migrated++;
        
        if (migrated % 50 === 0) {
          console.log(`  📊 Progress: ${migrated} appointments migrated...`);
        }

      } catch (error) {
        console.error(`  ❌ Error migrating turno ${turno.id}:`, error.message);
        skipped++;
      }
    }

    return { migrated, skipped };

  } finally {
    await mysqlConn.end();
  }
}

async function main() {
  console.log('🚀 Starting appointments migration...\n');
  console.log('This will migrate RESERVED/CONFIRMED appointments only');
  console.log('(Status: P, C, T from future dates)\n');

  // Conectar a PostgreSQL
  const pgConnection = await createConnection({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    username: process.env.DB_USERNAME || 'reviturnos_user',
    password: process.env.DB_PASSWORD || 'reviturnos_pass',
    database: process.env.DB_DATABASE || 'reviturnos_db',
    entities: [Plant, Appointment, AppointmentDetail, Payment],
  });

  try {
    const plantRepo = pgConnection.getRepository(Plant);
    let totalMigrated = 0;
    let totalSkipped = 0;

    for (const plant of PLANTS) {
      try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Processing: ${plant.code.toUpperCase()}`);
        console.log('='.repeat(60));

        // Obtener ID de planta en PostgreSQL
        const pgPlant = await plantRepo.findOne({ where: { code: plant.code } as any });
        
        if (!pgPlant) {
          console.error(`  ❌ Plant ${plant.code} not found in PostgreSQL`);
          continue;
        }

        const result = await migrateAppointmentsForPlant(plant, pgPlant.id, pgConnection);
        
        console.log(`\n  ✅ ${plant.code}: ${result.migrated} migrated, ${result.skipped} skipped`);
        
        totalMigrated += result.migrated;
        totalSkipped += result.skipped;

      } catch (error) {
        console.error(`\n❌ Error processing ${plant.code}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Migrated: ${totalMigrated}`);
    console.log(`Total Skipped: ${totalSkipped}`);
    console.log(`Total Processed: ${totalMigrated + totalSkipped}`);
    console.log('\n✅ Migration completed!');

  } finally {
    await pgConnection.close();
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
