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

async function smartMigrate() {
  console.log('\n💾 MIGRACIÓN INTELIGENTE (verifica y migra solo faltantes)\n');
  
  await postgresDataSource.initialize();
  
  let totalDetails = 0;
  let totalPayments = 0;

  for (const plant of mysqlPlants) {
    console.log('='.repeat(70));
    console.log(`🏭 ${plant.name.toUpperCase()}`);
    console.log('='.repeat(70));

    // Verificar estado actual en PostgreSQL
    const [detailsCount] = await postgresDataSource.query(
      `SELECT COUNT(*) as count FROM appointment_details ad 
       JOIN appointments a ON ad."appointmentId" = a.id 
       WHERE a."legacyPlant" = $1`,
      [plant.plantCode]
    );

    const [paymentsCount] = await postgresDataSource.query(
      `SELECT COUNT(*) as count FROM payments p 
       JOIN appointments a ON p."appointmentId" = a.id 
       WHERE a."legacyPlant" = $1`,
      [plant.plantCode]
    );

    console.log(`\n📊 Estado actual:`);
    console.log(`  - Detalles: ${detailsCount.count}`);
    console.log(`  - Pagos: ${paymentsCount.count}`);

    const mysqlDS = new DataSource({
      type: 'mysql',
      host: 'localhost',
      port: 3307,
      username: plant.user,
      password: plant.password,
      database: plant.database,
    });

    await mysqlDS.initialize();

    try {
      // DETALLES - Comparar cantidades y migrar si falta
      const datosCount = await mysqlDS.query(`SELECT COUNT(*) as total FROM datos_turno`);
      const mysqlTotal = datosCount[0].total;
      const postgresTotal = parseInt(detailsCount.count);
      
      console.log(`\n📋 Detalles: ${postgresTotal}/${mysqlTotal} en PostgreSQL`);
      
      if (postgresTotal < mysqlTotal) {
        const faltantes = mysqlTotal - postgresTotal;
        console.log(`  🔄 Faltan ${faltantes} detalles, migrando...`);
        
        // Obtener IDs de turnos que YA tienen detalles en PostgreSQL
        console.log(`  📥 Obteniendo turnos ya migrados...`);
        const migrados = await postgresDataSource.query(`
          SELECT a."legacyTurnoId" 
          FROM appointment_details ad
          JOIN appointments a ON ad."appointmentId" = a.id
          WHERE a."legacyPlant" = $1
        `, [plant.plantCode]);
        
        const migradosSet = new Set(migrados.map(m => m.legacyTurnoId));
        console.log(`  ✓ ${migradosSet.size} turnos ya tienen detalles`);
        
        // Obtener SOLO los turnos que NO están migrados
        console.log(`  📥 Obteniendo turnos faltantes de MySQL...`);
        const datos = await mysqlDS.query(`SELECT * FROM datos_turno`);
        console.log(`  ✓ ${datos.length} registros en MySQL`);
        
        // Obtener TODOS los appointments de esta planta en una sola query
        console.log(`  📥 Cargando appointments de PostgreSQL...`);
        const allAppointments = await postgresDataSource.query(`
          SELECT id, "legacyTurnoId" 
          FROM appointments 
          WHERE "legacyPlant" = $1
        `, [plant.plantCode]);
        
        const appointmentsMap = new Map(allAppointments.map(a => [parseInt(a.legacyTurnoId), a.id]));
        console.log(`  ✓ ${appointmentsMap.size} appointments cargados en memoria`);
        
        let detMigrated = 0;
        let detSkipped = 0;
        let detNoAppointment = 0;
        
        console.log(`  🔄 Procesando ${datos.length} registros...`);
        let processed = 0;
        
        for (const d of datos) {
          processed++;
          
          // Log cada 1000 procesados para ver progreso
          if (processed % 1000 === 0) {
            console.log(`  📊 ${processed}/${datos.length} (insertados: ${detMigrated}, sin apt: ${detNoAppointment})`);
          }
          
          // Saltear si ya está migrado
          if (migradosSet.has(d.id_turno)) {
            continue;
          }
          
          // Buscar appointment en el Map (en memoria, super rápido)
          const aptId = appointmentsMap.get(d.id_turno);
          
          if (!aptId) {
            detNoAppointment++;
            continue;
          }

          // Insertar
          try {
            await postgresDataSource.query(
              `INSERT INTO appointment_details ("appointmentId", "customerName", "customerPhone", "customerEmail", "vehicleDomain", "vehicleBrand", "vehicleModel", "vehicleYear", "vehicleFuel", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
              [aptId, d.nombre, d.telefono, d.email, d.dominio, d.marca, d.modelo, d.anio, d.combustible]
            );
            detMigrated++;
          } catch (err) {
            // Ignorar duplicados (constraint UQ_6da9eda7139d05b8797ddc45698)
            if (err.code !== '23505') {
              detSkipped++;
            }
          }
        }
        
        console.log(`  ✅ ${detMigrated} detalles nuevos insertados`);
        if (detNoAppointment > 0) console.log(`  ⚠️  ${detNoAppointment} sin appointment`);
        if (detSkipped > 0) console.log(`  ❌ ${detSkipped} errores`);
        totalDetails += detMigrated;
      } else {
        console.log(`  ✅ Completo (100%)`);
      }

      // PAGOS - Comparar cantidades y migrar si falta
      const cobrosCount = await mysqlDS.query(`SELECT COUNT(*) as total FROM cobros`);
      const mysqlPagos = cobrosCount[0].total;
      const postgresPagos = parseInt(paymentsCount.count);
      
      console.log(`\n💰 Pagos: ${postgresPagos}/${mysqlPagos} en PostgreSQL`);
      
      if (postgresPagos < mysqlPagos) {
        const faltantes = mysqlPagos - postgresPagos;
        console.log(`  🔄 Faltan ${faltantes} pagos, migrando...`);
        
        // Obtener IDs de pagos ya migrados (por externalPaymentId)
        console.log(`  📥 Obteniendo pagos ya migrados...`);
        const migrados = await postgresDataSource.query(`
          SELECT p."externalPaymentId" 
          FROM payments p
          JOIN appointments a ON p."appointmentId" = a.id
          WHERE a."legacyPlant" = $1 AND p."externalPaymentId" IS NOT NULL
        `, [plant.plantCode]);
        
        const migradosSet = new Set(migrados.map(m => m.externalPaymentId));
        console.log(`  ✓ ${migradosSet.size} pagos ya migrados`);
        
        console.log(`  📥 Obteniendo pagos de MySQL...`);
        const cobros = await mysqlDS.query(`SELECT * FROM cobros`);
        console.log(`  ✓ ${cobros.length} registros en MySQL`);
        
        // Cargar appointments en Map (reutilizar si existe)
        let appointmentsMap;
        if (typeof appointmentsMap === 'undefined') {
          console.log(`  📥 Cargando appointments de PostgreSQL...`);
          const allAppointments = await postgresDataSource.query(`
            SELECT id, "legacyTurnoId" 
            FROM appointments 
            WHERE "legacyPlant" = $1
          `, [plant.plantCode]);
          appointmentsMap = new Map(allAppointments.map(a => [parseInt(a.legacyTurnoId), a.id]));
          console.log(`  ✓ ${appointmentsMap.size} appointments cargados`);
        }
        
        let payMigrated = 0;
        let paySkipped = 0;
        let payNoData = 0;
        
        console.log(`  🔄 Procesando ${cobros.length} registros...`);
        let processed = 0;
        
        for (const c of cobros) {
          processed++;
          
          // Log cada 1000 procesados
          if (processed % 1000 === 0) {
            console.log(`  📊 ${processed}/${cobros.length} (insertados: ${payMigrated}, sin datos: ${payNoData})`);
          }
          
          // Saltear si ya está migrado
          if (migradosSet.has(c.id_cobro)) {
            continue;
          }
          
          if (!c.monto || c.monto === null) {
            payNoData++;
            continue;
          }
          
          // Buscar en Map en lugar de query
          const aptId = appointmentsMap.get(c.id_turno);
          
          if (!aptId) {
            payNoData++;
            continue;
          }

          // Normalizar fecha
          let fecha = c.fecha;
          if (typeof fecha === 'string' && fecha.match(/^\d{2}-\d{2}-\d{4}/)) {
            const partes = fecha.split(/[- :]/);
            fecha = `${partes[2]}-${partes[1]}-${partes[0]} ${partes[3] || '00'}:${partes[4] || '00'}:${partes[5] || '00'}`;
          }

          try {
            await postgresDataSource.query(
              `INSERT INTO payments ("appointmentId", "paymentDate", "amount", "currency", "method", "externalPaymentId", "status", "origin", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
              [aptId, fecha, c.monto, 'ARS', c.metodo || 'unknown', c.id_cobro, 'approved', (c.origen || 'T').charAt(0)]
            );
            payMigrated++;
          } catch (err) {
            paySkipped++;
          }
        }
        
        console.log(`  ✅ ${payMigrated} pagos nuevos insertados`);
        if (payNoData > 0) console.log(`  ⚠️  ${payNoData} sin datos/appointment`);
        if (paySkipped > 0) console.log(`  ❌ ${paySkipped} errores`);
        totalPayments += payMigrated;
      } else {
        console.log(`  ✅ Completo (100%)`);
      }

    } finally {
      await mysqlDS.destroy();
    }
  }

  await postgresDataSource.destroy();

  console.log('\n' + '='.repeat(70));
  console.log('✅ MIGRACIÓN COMPLETADA');
  console.log(`📋 Detalles migrados: ${totalDetails}`);
  console.log(`💰 Pagos migrados: ${totalPayments}`);
  console.log('='.repeat(70));
}

smartMigrate()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
