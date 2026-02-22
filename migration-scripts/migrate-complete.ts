import { DataSource } from 'typeorm';

const postgresDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5433,
  username: 'reviturnos',
  password: 'reviturnos_password_2026',
  database: 'reviturnos',
});

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

function formatTime(hora: number | string): string {
  if (typeof hora === 'string') return hora;
  const str = hora.toString().padStart(6, '0');
  return `${str.substring(0,2)}:${str.substring(2,4)}:${str.substring(4,6)}`;
}

async function migrateComplete() {
  console.log('\n💾 MIGRACIÓN COMPLETA\n');
  
  await postgresDataSource.initialize();
  
  let totalAppointments = 0;
  let totalDetails = 0;
  let totalPayments = 0;

  for (const plant of mysqlPlants) {
    console.log('='.repeat(70));
    console.log(`🏭 ${plant.name.toUpperCase()}`);
    console.log('='.repeat(70));

    const mysqlDS = new DataSource({
      type: 'mysql',
      host: '127.0.0.1',
      port: 3308,
      username: 'root',
      password: 'reviturnos_mysql_root_2026',
      database: plant.database,
    });

    await mysqlDS.initialize();

    try {
      // OBTENER UUIDs
      const [plantRow] = await postgresDataSource.query(
        `SELECT id FROM plants WHERE code = $1`,
        [plant.plantCode]
      );
      const plantUuid = plantRow.id;

      // ============================================================
      // PASO 1: MIGRAR APPOINTMENTS
      // ============================================================
      console.log('\n📅 PASO 1/3: Migrando appointments...');
      
      const turnos = await mysqlDS.query(`SELECT * FROM turnos ORDER BY id`);
      console.log(`  ✓ ${turnos.length} turnos en MySQL`);

      // Cargar TODAS las líneas en Map
      console.log(`  📥 Cargando inspection_lines...`);
      const allLines = await postgresDataSource.query(`
        SELECT id, "legacyLineId" FROM inspection_lines WHERE "plantId" = $1
      `, [plantUuid]);
      const linesMap = new Map(allLines.map(l => [parseInt(l.legacyLineId), l.id]));
      console.log(`  ✓ ${linesMap.size} líneas cargadas`);

      let aptMigrated = 0;
      let aptSkipped = 0;
      let aptNoLine = 0;
      let aptProcessed = 0;

      console.log(`  🔄 Procesando ${turnos.length} turnos...`);

      for (const t of turnos) {
        aptProcessed++;
        if (aptProcessed % 1000 === 0) {
          console.log(`  📊 turnos ${aptProcessed}/${turnos.length} | insertados=${aptMigrated} | sin_linea=${aptNoLine} | errores=${aptSkipped}`);
        }

        const lineId = linesMap.get(t.id_linea);

        if (!lineId) {
          aptNoLine++;
          if (aptNoLine <= 3) {
            console.log(`  ⚠️  Sin línea: turno ${t.id} busca id_linea=${t.id_linea}`);
          }
          continue;
        }

        try {
          await postgresDataSource.query(`
            INSERT INTO appointments (
              "plantId", "lineId", "appointmentDate", "appointmentTime", "status", "origin",
              "expiresAt", "observations", "paymentId", "legacyTurnoId",
              "legacyPlant", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [
            plantUuid,
            lineId,
            t.fecha,
            formatTime(t.hora),
            t.estado || 'D',
            t.origen || 'T',
            t.vencimiento,
            t.observaciones || null,
            t.id_cobro_yac || null,
            t.id,
            plant.plantCode,
            t.created_at || new Date(),
            t.updated_at || new Date(),
          ]);
          aptMigrated++;
          if (aptMigrated % 1000 === 0) console.log(`  ... ${aptMigrated} insertados`);
        } catch (err) {
          aptSkipped++;
          if (aptSkipped <= 3) {
            console.log(`  ❌ Error turno ${t.id}: ${err.message.substring(0, 80)}`);
          }
        }
      }

      console.log(`  ✅ ${aptMigrated} appointments migrados`);
      if (aptNoLine > 0) console.log(`  ⚠️  ${aptNoLine} sin línea`);
      if (aptSkipped > 0) console.log(`  ❌ ${aptSkipped} errores`);
      totalAppointments += aptMigrated;

      // Cargar appointments en Map
      console.log(`  📥 Cargando appointments...`);
      const allApts = await postgresDataSource.query(`
        SELECT id, "legacyTurnoId" FROM appointments WHERE "legacyPlant" = $1
      `, [plant.plantCode]);
      const aptsMap = new Map(allApts.map(a => [parseInt(a.legacyTurnoId), a.id]));
      console.log(`  ✓ ${aptsMap.size} appointments cargados`);

      // ============================================================
      // PASO 2: MIGRAR DETAILS
      // ============================================================
      console.log('\n📋 PASO 2/3: Migrando detalles...');
      
      const datos = await mysqlDS.query(`SELECT * FROM datos_turno`);
      console.log(`  ✓ ${datos.length} registros en MySQL`);

      let detMigrated = 0;
      let detSkipped = 0;
      let detNoAppointment = 0;
      let detProcessed = 0;

      for (const d of datos) {
        detProcessed++;
        if (detProcessed % 1000 === 0) {
          console.log(`  📊 detalles ${detProcessed}/${datos.length} | insertados=${detMigrated} | sin_appointment=${detNoAppointment} | errores=${detSkipped}`);
        }

        const aptId = aptsMap.get(d.id_turno);
        if (!aptId) {
          detNoAppointment++;
          continue;
        }

        try {
          await postgresDataSource.query(`
            INSERT INTO appointment_details (
              "appointmentId", "customerName", "customerPhone", "customerEmail",
              "vehicleDomain", "vehicleBrand", "vehicleModel", "vehicleYear",
              "vehicleFuel", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          `, [aptId, d.nombre, d.telefono, d.email, d.dominio, d.marca, d.modelo, d.anio, d.combustible]);
          detMigrated++;
          if (detMigrated % 1000 === 0) console.log(`  ... ${detMigrated}`);
        } catch (err) {
          if (err.code !== '23505') detSkipped++;
        }
      }

      console.log(`  ✅ ${detMigrated} detalles migrados (sin_appointment=${detNoAppointment}, errores=${detSkipped})`);
      totalDetails += detMigrated;

      // ============================================================
      // PASO 3: MIGRAR PAYMENTS
      // ============================================================
      console.log('\n💰 PASO 3/3: Migrando pagos...');
      
      const cobros = await mysqlDS.query(`SELECT * FROM cobros`);
      console.log(`  ✓ ${cobros.length} registros en MySQL`);

      let payMigrated = 0;
      let paySkipped = 0;
      let payNoAppointment = 0;
      let payNoAmount = 0;
      let payProcessed = 0;

      for (const c of cobros) {
        payProcessed++;
        if (payProcessed % 1000 === 0) {
          console.log(`  📊 pagos ${payProcessed}/${cobros.length} | insertados=${payMigrated} | sin_amount=${payNoAmount} | sin_appointment=${payNoAppointment} | errores=${paySkipped}`);
        }

        if (!c.monto || c.monto === null) {
          payNoAmount++;
          continue;
        }

        const aptId = aptsMap.get(c.id_turno);
        if (!aptId) {
          payNoAppointment++;
          continue;
        }

        let fecha = c.fecha;
        if (typeof fecha === 'string' && fecha.match(/^\d{2}-\d{2}-\d{4}/)) {
          const p = fecha.split(/[- :]/);
          fecha = `${p[2]}-${p[1]}-${p[0]} ${p[3] || '00'}:${p[4] || '00'}:${p[5] || '00'}`;
        }

        try {
          await postgresDataSource.query(`
            INSERT INTO payments (
              "appointmentId", "paymentDate", "amount", "currency",
              "method", "externalPaymentId", "status", "origin", "createdAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          `, [aptId, fecha, c.monto, 'ARS', c.metodo || 'unknown', c.id_cobro, 'approved', (c.origen || 'T').charAt(0)]);
          payMigrated++;
          if (payMigrated % 1000 === 0) console.log(`  ... ${payMigrated}`);
        } catch (err) {
          paySkipped++;
        }
      }

      console.log(`  ✅ ${payMigrated} pagos migrados (sin_amount=${payNoAmount}, sin_appointment=${payNoAppointment}, errores=${paySkipped})`);
      totalPayments += payMigrated;

    } finally {
      await mysqlDS.destroy();
    }
  }

  await postgresDataSource.destroy();

  console.log('\n' + '='.repeat(70));
  console.log('✅ MIGRACIÓN COMPLETADA');
  console.log(`📅 Appointments: ${totalAppointments}`);
  console.log(`📋 Detalles: ${totalDetails}`);
  console.log(`💰 Pagos: ${totalPayments}`);
  console.log('='.repeat(70));
}

migrateComplete()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
