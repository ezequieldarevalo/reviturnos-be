import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const mysqlPlants = [
  {
    name: 'lasheras',
    database: 'lhrevitotal',
    user: 'adminlhrevitotal',
    password: 'YnWL@fdA6fRk3@xI6VGM3K',
    plantId: 'lasheras',
  },
  {
    name: 'maipu',
    database: 'marevitotal',
    user: 'adminmarevitotal',
    password: 't4nx31Fm]ha-i{NITBtM',
    plantId: 'maipu',
  },
  {
    name: 'godoycruz',
    database: 'rtogc',
    user: 'adminrtogc',
    password: 'vq:oaDyHYKG2Gf+xWI5%',
    plantId: 'godoycruz',
  },
];

const postgresDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5433,
  username: 'reviturnos',
  password: 'reviturnos_password_2026',
  database: 'reviturnos',
});

interface AppointmentDetail {
  id_turno: number;
  nombre: string;
  telefono: string;
  email: string;
  dominio: string;
  tipo_vehiculo: string;
  marca: string;
  modelo: string;
  anio: number;
  combustible: string;
}

async function migrateAppointmentDetails() {
  console.log('\n📋 MIGRACIÓN DE DETALLES DE TURNOS\n');
  
  await postgresDataSource.initialize();
  console.log('✅ Connected to PostgreSQL\n');

  let totalMigrated = 0;
  let totalSkipped = 0;

  for (const plant of mysqlPlants) {
    console.log('='.repeat(60));
    console.log(`Processing: ${plant.name.toUpperCase()}`);
    console.log('='.repeat(60));

    // Obtener el UUID de la planta
    const plantResult = await postgresDataSource.query(
      'SELECT id FROM plants WHERE code = $1',
      [plant.plantId]
    );

    if (plantResult.length === 0) {
      console.log(`  ❌ Plant ${plant.plantId} not found in database`);
      continue;
    }

    const plantUuid = plantResult[0].id;

    const mysqlDataSource = new DataSource({
      type: 'mysql',
      host: 'localhost',
      port: 3307,
      username: plant.user,
      password: plant.password,
      database: plant.database,
    });

    await mysqlDataSource.initialize();

    try {
      console.log(`\n📖 Reading appointment details from ${plant.name}...`);
      
      // Obtener detalles de MySQL
      const mysqlDetails = await mysqlDataSource.query<AppointmentDetail[]>(`
        SELECT 
          dt.*,
          l.tipo_vehiculo
        FROM datos_turno dt
        INNER JOIN turnos t ON dt.id_turno = t.id
        LEFT JOIN lineas l ON t.id_linea = l.id
        WHERE t.estado IN ('P', 'C', 'T')
          AND t.fecha >= '2025-01-01'
        ORDER BY t.fecha, t.hora
      `);

      console.log(`  ✓ Found ${mysqlDetails.length} appointment details in MySQL`);

      let migrated = 0;
      let skipped = 0;

      for (const detail of mysqlDetails) {
        // Obtener fecha y hora del turno desde MySQL
        const turnoData = await mysqlDataSource.query(`
          SELECT fecha, hora FROM turnos WHERE id = ${detail.id_turno}
        `);

        if (turnoData.length === 0) {
          skipped++;
          continue;
        }

        const fecha = turnoData[0].fecha;
        const hora = turnoData[0].hora;

        // Buscar el appointment en PostgreSQL por fecha, hora y plantId
        const appointments = await postgresDataSource.query(`
          SELECT a.id
          FROM appointments a
          WHERE a."plantId" = $1
            AND a."appointmentDate" = $2
            AND a."appointmentTime" = $3
          LIMIT 1
        `, [plantUuid, fecha, hora]);

        if (appointments.length === 0) {
          skipped++;
          continue;
        }

        const appointmentId = appointments[0].id;

        // Verificar si ya existe el detalle
        const existingDetail = await postgresDataSource.query(
          'SELECT id FROM appointment_details WHERE "appointmentId" = $1',
          [appointmentId]
        );

        if (existingDetail.length > 0) {
          skipped++;
          continue;
        }

        // Insertar detalle en PostgreSQL
        await postgresDataSource.query(`
          INSERT INTO appointment_details (
            "appointmentId",
            "customerName",
            "customerPhone",
            "customerEmail",
            "vehicleDomain",
            "vehicleType",
            "vehicleBrand",
            "vehicleModel",
            "vehicleYear",
            "vehicleFuel",
            "createdAt",
            "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        `, [
          appointmentId,
          detail.nombre || null,
          detail.telefono || null,
          detail.email || null,
          detail.dominio || null,
          detail.tipo_vehiculo || null,
          detail.marca || null,
          detail.modelo || null,
          detail.anio || null,
          detail.combustible || null,
        ]);

        migrated++;

        if (migrated % 100 === 0) {
          console.log(`  ... migrated ${migrated} details`);
        }
      }

      totalMigrated += migrated;
      totalSkipped += skipped;

      console.log(`  ✅ ${plant.name}: ${migrated} details migrated, ${skipped} skipped`);
    } catch (error) {
      console.error(`❌ Error processing ${plant.name}:`, error);
    } finally {
      await mysqlDataSource.destroy();
    }
  }

  await postgresDataSource.destroy();

  console.log('\n' + '='.repeat(60));
  console.log('✅ MIGRATION COMPLETED');
  console.log(`Total migrated: ${totalMigrated}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log('='.repeat(60) + '\n');
}

migrateAppointmentDetails()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
