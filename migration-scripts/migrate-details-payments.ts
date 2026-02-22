import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const mysqlPlants = [
  {
    name: 'lasheras',
    database: 'lhrevitotal',
    user: 'adminlhrevitotal',
    password: 'YnWL@fdA6fRk3@xI6VGM3K',
    plantCode: 'lasheras',
  },
  {
    name: 'maipu',
    database: 'marevitotal',
    user: 'adminmarevitotal',
    password: 't4nx31Fm]ha-i{NITBtM',
    plantCode: 'maipu',
  },
  {
    name: 'godoycruz',
    database: 'rtogc',
    user: 'adminrtogc',
    password: 'vq:oaDyHYKG2Gf+xWI5%',
    plantCode: 'godoycruz',
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

interface MysqlDatosTurno {
  id_turno: number;
  nombre: string;
  telefono: string;
  email: string;
  dominio: string;
  marca: string;
  modelo: string;
  anio: number;
  combustible: string;
}

interface MysqlCobro {
  id: number;
  id_turno: number;
  forma_pago: string;
  importe: number;
  fecha: Date;
  id_pago_externo: string;
}

async function migrateDetailsAndPayments() {
  console.log('\n💾 MIGRACIÓN DE DETALLES Y PAGOS\n');
  
  await postgresDataSource.initialize();
  console.log('✅ Connected to PostgreSQL\n');

  let totalDetails = 0;
  let totalPayments = 0;

  for (const plant of mysqlPlants) {
    console.log('='.repeat(70));
    console.log(`🏭 PLANTA: ${plant.name.toUpperCase()}`);
    console.log('='.repeat(70));

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
      // ===================================================================
      // PASO 1: MIGRAR DETALLES (appointment_details)
      // ===================================================================
      console.log('\n📋 PASO 1/2: Migrando datos de turnos...');
      
      const datosTurnos = await mysqlDataSource.query<MysqlDatosTurno[]>(`
        SELECT * FROM datos_turno ORDER BY id_turno
      `);

      console.log(`  ✓ Encontrados ${datosTurnos.length} registros de datos_turno`);

      let detailsMigrated = 0;
      let detailsSkipped = 0;

      for (const dato of datosTurnos) {
        // Buscar appointment por legacyTurnoId y legacyPlant
        const appointments = await postgresDataSource.query(`
          SELECT id FROM appointments 
          WHERE "legacyTurnoId" = $1 AND "legacyPlant" = $2
          LIMIT 1
        `, [dato.id_turno, plant.plantCode]);

        if (appointments.length === 0) {
          detailsSkipped++;
          continue;
        }

        const appointmentUuid = appointments[0].id;

        try {
          await postgresDataSource.query(`
            INSERT INTO appointment_details (
              "appointmentId",
              "customerName",
              "customerPhone",
              "customerEmail",
              "vehicleDomain",
              "vehicleBrand",
              "vehicleModel",
              "vehicleYear",
              "vehicleFuel",
              "createdAt",
              "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            ON CONFLICT ("appointmentId") DO NOTHING
          `, [
            appointmentUuid,
            dato.nombre || null,
            dato.telefono || null,
            dato.email || null,
            dato.dominio || null,
            dato.marca || null,
            dato.modelo || null,
            dato.anio || null,
            dato.combustible || null,
          ]);

          detailsMigrated++;

          if (detailsMigrated % 1000 === 0) {
            console.log(`  ... migrado ${detailsMigrated} detalles`);
          }
        } catch (error) {
          detailsSkipped++;
          if (detailsSkipped < 10) {
            console.error(`  ⚠️  Error en dato turno ${dato.id_turno}:`, error.message);
          }
        }
      }

      console.log(`  ✅ ${plant.name}: ${detailsMigrated} detalles migrados, ${detailsSkipped} saltados`);
      totalDetails += detailsMigrated;

      // ===================================================================
      // PASO 2: MIGRAR PAGOS (payments)
      // ===================================================================
      console.log('\n💰 PASO 2/2: Migrando pagos...');
      
      const cobros = await mysqlDataSource.query<MysqlCobro[]>(`
        SELECT * FROM cobros ORDER BY id_turno
      `);

      console.log(`  ✓ Encontrados ${cobros.length} pagos en MySQL`);

      let paymentsMigrated = 0;
      let paymentsSkipped = 0;

      for (const cobro of cobros) {
        // Buscar appointment por legacyTurnoId y legacyPlant
        const appointments = await postgresDataSource.query(`
          SELECT id FROM appointments 
          WHERE "legacyTurnoId" = $1 AND "legacyPlant" = $2
          LIMIT 1
        `, [cobro.id_turno, plant.plantCode]);

        if (appointments.length === 0) {
          paymentsSkipped++;
          continue;
        }

        const appointmentUuid = appointments[0].id;

        try {
          await postgresDataSource.query(`
            INSERT INTO payments (
              "appointmentId",
              "paymentDate",
              "amount",
              "currency",
              "method",
              "externalPaymentId",
              "status",
              "origin",
              "createdAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          `, [
            appointmentUuid,
            cobro.fecha,
            cobro.importe,
            'ARS',
            cobro.forma_pago || 'unknown',
            cobro.id_pago_externo || null,
            'approved',
            'T',
          ]);

          paymentsMigrated++;

          if (paymentsMigrated % 1000 === 0) {
            console.log(`  ... migrado ${paymentsMigrated} pagos`);
          }
        } catch (error) {
          paymentsSkipped++;
          if (paymentsSkipped < 10) {
            console.error(`  ⚠️  Error en pago turno ${cobro.id_turno}:`, error.message);
          }
        }
      }

      console.log(`  ✅ ${plant.name}: ${paymentsMigrated} pagos migrados, ${paymentsSkipped} saltados`);
      totalPayments += paymentsMigrated;

      console.log(`\n✅ ${plant.name} completado!\n`);

    } catch (error) {
      console.error(`❌ Error procesando ${plant.name}:`, error);
    } finally {
      await mysqlDataSource.destroy();
    }
  }

  await postgresDataSource.destroy();

  console.log('\n' + '='.repeat(70));
  console.log('✅ MIGRACIÓN COMPLETADA');
  console.log('='.repeat(70));
  console.log(`📋 Total details: ${totalDetails}`);
  console.log(`💰 Total payments: ${totalPayments}`);
  console.log('='.repeat(70) + '\n');
}

migrateDetailsAndPayments()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
