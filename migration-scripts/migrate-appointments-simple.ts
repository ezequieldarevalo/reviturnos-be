import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';

/**
 * Script simplificado de migración de turnos RESERVADOS
 * Solo migra turnos con estados P/C/T (pagados, confirmados, completados)
 */

// Conexión vía SSH tunnel
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

function mapStatus(oldStatus: string): string {
  switch (oldStatus) {
    case 'P': return 'P'; // PAID
    case 'C': return 'C'; // CONFIRMED
    case 'T': return 'T'; // COMPLETED
    default: return 'R'; // RESERVED
  }
}

function mapOrigin(oldOrigin: string): string {
  return oldOrigin === 'A' ? 'A' : 'T'; // A=Admin, T=Web
}

function formatTime(hora: number | string): string {
  // Si ya es un string TIME (HH:MM:SS), devolver HH:MM:SS completo
  if (typeof hora === 'string') {
    return hora; // Ya viene en formato correcto desde MySQL
  }
  
  // Si es número (formato viejo), convertir
  const str = hora.toString().padStart(6, '0');
  const hours = str.substring(0, 2);
  const minutes = str.substring(2, 4);
  const seconds = str.substring(4, 6);
  return `${hours}:${minutes}:${seconds}`;
}

async function migrateAppointmentsForPlant(
  plant: typeof PLANTS[0],
  pgConnection: DataSource,
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
    // Obtener ID de la planta en PostgreSQL
    const plantRows: any[] = await pgConnection.query(
      `SELECT id FROM plants WHERE code = $1`,
      [plant.code]
    );

    if (!plantRows || plantRows.length === 0) {
      console.log(`  ❌ Plant ${plant.code} not found in PostgreSQL`);
      return { migrated: 0, skipped: 0 };
    }

    const postgresPlantId = plantRows[0].id;

    // Obtener mapeo de líneas (por tipo de vehículo)
    const lineRows: any[] = await pgConnection.query(
      `SELECT id, "vehicleType" FROM inspection_lines WHERE "plantId" = $1`,
      [postgresPlantId]
    );

    const lineMap: Record<string, string> = {};
    lineRows.forEach((line) => {
      lineMap[line.vehicleType] = line.id;
    });

    console.log(`  ✓ Found ${lineRows.length} lines for plant`);

    // 1. Obtener turnos reservados/confirmados desde 2025
    const [turnos] = await mysqlConn.query(`
      SELECT 
        t.*,
        l.tipo_vehiculo,
        l.id as linea_id
      FROM turnos t
      LEFT JOIN lineas l ON l.id = t.id_linea
      WHERE t.estado IN ('P', 'C', 'T')
        AND t.fecha >= '2025-01-01'
      ORDER BY t.fecha, t.hora
    `);

    console.log(`  ✓ Found ${(turnos as any[]).length} appointments to migrate`);

    if ((turnos as any[]).length === 0) {
      console.log(`  ℹ️  No appointments to migrate for ${plant.code}`);
      return { migrated: 0, skipped: 0 };
    }

    let migrated = 0;
    let skipped = 0;

    for (const turno of turnos as any[]) {
      try {
        // Verificar si ya existe
        const [existing] = await pgConnection.query(
          `SELECT id FROM appointments 
           WHERE "plantId" = $1 
           AND "appointmentDate" = $2 
           AND "appointmentTime" = $3`,
          [postgresPlantId, turno.fecha, formatTime(turno.hora)]
        );

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        // Mapear tipo de vehículo a UUID de línea
        const vehicleType = turno.tipo_vehiculo || 'AUTO PARTICULAR';
        const lineId = lineMap[vehicleType] || lineMap['AUTO PARTICULAR'];

        if (!lineId) {
          console.log(`  ⚠️  No line found for vehicle type: ${vehicleType}`);
          skipped++;
          continue;
        }

        // 2. Crear appointment
        const aptResultRows: any[] = await pgConnection.query(
          `INSERT INTO appointments (
            "plantId", "lineId", "appointmentDate", "appointmentTime",
            status, origin, "reservedAt", observations, "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          RETURNING id`,
          [
            postgresPlantId,
            lineId,
            turno.fecha,
            formatTime(turno.hora),
            mapStatus(turno.estado),
            mapOrigin(turno.origen),
            new Date(turno.fecha),
            turno.observaciones || null,
          ]
        );

        const appointmentId = aptResultRows[0].id;

        migrated++;

        if (migrated % 10 === 0) {
          console.log(`  ... migrated ${migrated} appointments`);
        }

        // Comentamos details y pagos por ahora - primero verificar que appointments funcionan
        /*
        // 3. Buscar detalles del turno
        const [details] = await mysqlConn.query(
          `SELECT * FROM datos_turno WHERE id_turno = ?`,
          [turno.id]
        );

        if ((details as any[]).length > 0) {
          const detail = (details as any[])[0];

          await pgConnection.query(
            `INSERT INTO appointment_details (
              "appointmentId", "customerName", "customerPhone", "customerEmail",
              "vehicleDomain", "vehicleType", "vehicleBrand", "vehicleModel",
              "vehicleYear", "vehicleFuel", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
            [
              appointmentId,
              detail.nombre || 'Sin nombre',
              detail.telefono || '',
              detail.email || '',
              detail.dominio || '',
              vehicleType,
              detail.marca || '',
              detail.modelo || '',
              detail.anio || null,
              detail.combustible || '',
            ]
          );
        }

        // 4. Buscar pagos
        const [pagos] = await mysqlConn.query(
          `SELECT * FROM cobros WHERE id_turno = ?`,
          [turno.id]
        );

        if ((pagos as any[]).length > 0) {
          const pago = (pagos as any[])[0];

          await pgConnection.query(
            `INSERT INTO payments (
              "appointmentId", amount, "paymentMethod", "paymentStatus",
              "externalPaymentId", "paidAt", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
            [
              appointmentId,
              pago.importe || 0,
              pago.forma_pago || 'cash',
              'approved',
              pago.id_pago_externo || null,
              pago.fecha_pago || new Date(),
            ]
          );
        }
        */

      } catch (error) {
        console.error(`  ❌ Error migrating appointment ${turno.id}:`, error.message);
        skipped++;
      }
    }

    console.log(`  ✅ ${plant.code}: ${migrated} migrated, ${skipped} skipped`);
    return { migrated, skipped };

  } finally {
    await mysqlConn.end();
  }
}

async function main() {
  console.log('\n🔄 MIGRACIÓN DE TURNOS RESERVADOS\n');

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
    let totalMigrated = 0;
    let totalSkipped = 0;

    for (const plant of PLANTS) {
      console.log(`${'='.repeat(60)}`);
      console.log(`Processing: ${plant.code.toUpperCase()}`);
      console.log('='.repeat(60));

      const result = await migrateAppointmentsForPlant(plant, pgDataSource);
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
