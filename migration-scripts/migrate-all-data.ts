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

interface MysqlTurno {
  id: number;
  fecha: string;
  hora: string;
  estado: string;
  vencimiento: Date | null;
  origen: string;
  observaciones: string;
  id_linea: number;
  id_cobro_yac: string;
  created_at: Date;
  updated_at: Date;
  tipo_vehiculo?: string;
}

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

function formatTime(hora: number | string): string {
  // Si ya es un string TIME (HH:MM:SS), devolver completo
  if (typeof hora === 'string') {
    return hora;
  }
  
  // Si es número (formato viejo), convertir
  const str = hora.toString().padStart(6, '0');
  const hours = str.substring(0, 2);
  const minutes = str.substring(2, 4);
  const seconds = str.substring(4, 6);
  return `${hours}:${minutes}:${seconds}`;
}

async function migrateAllData() {
  console.log('\n🚀 MIGRACIÓN COMPLETA DE DATOS\n');
  
  await postgresDataSource.initialize();
  console.log('✅ Connected to PostgreSQL\n');

  let totalAppointments = 0;
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
      // Obtener UUID de la planta
      const plantResult = await postgresDataSource.query(
        'SELECT id FROM plants WHERE code = $1',
        [plant.plantCode]
      );

      if (plantResult.length === 0) {
        console.log(`  ❌ Plant ${plant.plantCode} not found in PostgreSQL`);
        continue;
      }

      const plantUuid = plantResult[0].id;

      // Mapeo: id_turno MySQL -> UUID PostgreSQL
      const turnoMap = new Map<number, string>();

      // ===================================================================
      // PASO 1: MIGRAR TURNOS (appointments)
      // ===================================================================
      console.log('\n📅 PASO 1/3: Migrando turnos...');
      
      const turnos = await mysqlDataSource.query<MysqlTurno[]>(`
        SELECT 
          t.*,
          l.tipo_vehiculo
        FROM turnos t
        LEFT JOIN lineas l ON t.id_linea = l.id
        ORDER BY t.id
      `);

      console.log(`  ✓ Encontrados ${turnos.length} turnos en MySQL`);

      let appointmentsMigrated = 0;
      let appointmentsSkipped = 0;

      for (const turno of turnos) {
        try {
          // Obtener o crear línea de inspección
          let lineUuid = null;
          if (turno.id_linea) {
            const lineResult = await postgresDataSource.query(
              'SELECT id FROM inspection_lines WHERE "plantId" = $1 AND "legacyLineId" = $2',
              [plantUuid, turno.id_linea]
            );

            if (lineResult.length > 0) {
              lineUuid = lineResult[0].id;
            }
          }

          // Insertar appointment
          const appointmentResult = await postgresDataSource.query(`
            INSERT INTO appointments (
              "plantId",
              "lineId",
              "appointmentDate",
              "appointmentTime",
              "status",
              "origin",
              "expiresAt",
              "observations",
              "rtoAppointmentNumber",
              "legacyTurnoId",
              "legacyPlant",
              "createdAt",
              "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id
          `, [
            plantUuid,
            lineUuid,
            turno.fecha,
            formatTime(turno.hora),
            turno.estado || 'D',
            turno.origen || 'T',
            turno.vencimiento,
            turno.observaciones || null,
            turno.id_cobro_yac || null,
            turno.id,
            plant.plantCode,
            turno.created_at || new Date(),
            turno.updated_at || new Date(),
          ]);

          const appointmentUuid = appointmentResult[0].id;
          turnoMap.set(turno.id, appointmentUuid);
          appointmentsMigrated++;

          if (appointmentsMigrated % 1000 === 0) {
            console.log(`  ... migrado ${appointmentsMigrated} turnos`);
          }
        } catch (error) {
          appointmentsSkipped++;
          if (appointmentsSkipped < 10) {
            console.error(`  ⚠️  Error en turno ${turno.id}:`, error.message);
          }
        }
      }

      console.log(`  ✅ ${plant.name}: ${appointmentsMigrated} turnos migrados, ${appointmentsSkipped} saltados`);
      totalAppointments += appointmentsMigrated;

      // Cargar TODOS los appointments en Map para lookup rápido (con parseInt)
      console.log(`  📥 Cargando appointments en memoria...`);
      const allAppointments = await postgresDataSource.query(`
        SELECT id, "legacyTurnoId" 
        FROM appointments 
        WHERE "legacyPlant" = $1
      `, [plant.plantCode]);
      const appointmentsMap = new Map(allAppointments.map(a => [parseInt(a.legacyTurnoId), a.id]));
      console.log(`  ✓ ${appointmentsMap.size} appointments cargados`);

      // ===================================================================
      // PASO 2: MIGRAR DATOS DE TURNOS (appointment_details)
      // ===================================================================
      console.log('\n📋 PASO 2/3: Migrando datos de turnos...');
      
      const datosTurnos = await mysqlDataSource.query<MysqlDatosTurno[]>(`
        SELECT * FROM datos_turno ORDER BY id_turno
      `);

      console.log(`  ✓ Encontrados ${datosTurnos.length} registros de datos_turno`);

      let detailsMigrated = 0;
      let detailsSkipped = 0;

      for (const dato of datosTurnos) {
        const appointmentUuid = appointmentsMap.get(dato.id_turno);
        
        if (!appointmentUuid) {
          detailsSkipped++;
          continue;
        }

        try {
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
            appointmentUuid,
            dato.nombre || null,
            dato.telefono || null,
            dato.email || null,
            dato.dominio || null,
            null, // tipo_vehiculo viene de lineas, no de datos_turno
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
            console.error(`  ⚠️  Error en datos turno ${dato.id_turno}:`, error.message);
          }
        }
      }

      console.log(`  ✅ ${plant.name}: ${detailsMigrated} detalles migrados, ${detailsSkipped} saltados`);
      totalDetails += detailsMigrated;

      // ===================================================================
      // PASO 3: MIGRAR PAGOS (payments)
      // ===================================================================
      console.log('\n💰 PASO 3/3: Migrando pagos...');
      
      const cobros = await mysqlDataSource.query<MysqlCobro[]>(`
        SELECT * FROM cobros ORDER BY id_turno
      `);

      console.log(`  ✓ Encontrados ${cobros.length} pagos en MySQL`);

      let paymentsMigrated = 0;
      let paymentsSkipped = 0;

      for (const cobro of cobros) {
        if (!cobro.monto || cobro.monto === null) {
          paymentsSkipped++;
          continue;
        }
        
        const appointmentUuid = appointmentsMap.get(cobro.id_turno);
        
        if (!appointmentUuid) {
          paymentsSkipped++;
          continue;
        }

        // Normalizar fecha
        let fecha = cobro.fecha;
        if (typeof fecha === 'string' && fecha.match(/^\d{2}-\d{2}-\d{4}/)) {
          const partes = fecha.split(/[- :]/);
          fecha = `${partes[2]}-${partes[1]}-${partes[0]} ${partes[3] || '00'}:${partes[4] || '00'}:${partes[5] || '00'}`;
        }

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
            fecha,
            cobro.monto,
            'ARS',
            cobro.metodo || 'unknown',
            cobro.id_cobro,
            'approved',
            (cobro.origen || 'T').charAt(0),
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
  console.log(`📅 Total appointments: ${totalAppointments}`);
  console.log(`📋 Total details: ${totalDetails}`);
  console.log(`💰 Total payments: ${totalPayments}`);
  console.log('='.repeat(70) + '\n');
}

migrateAllData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
