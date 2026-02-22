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

async function migrateMissingDetailsAndPayments() {
  console.log('\n💾 MIGRACIÓN DE DETALLES Y PAGOS (solo faltantes)\n');
  
  await postgresDataSource.initialize();
  
  let totalDetails = 0;
  let totalPayments = 0;

  for (const plant of mysqlPlants) {
    console.log('='.repeat(70));
    console.log(`🏭 ${plant.name.toUpperCase()}`);
    console.log('='.repeat(70));

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
      // DETALLES
      console.log('\n📋 Migrando detalles...');
      const datos = await mysqlDS.query(`SELECT * FROM datos_turno`);
      console.log(`  ✓ ${datos.length} registros en MySQL`);

      let detMigrated = 0;
      for (const d of datos) {
        const [apt] = await postgresDataSource.query(
          `SELECT id FROM appointments WHERE "legacyTurnoId" = $1 AND "legacyPlant" = $2`,
          [d.id_turno, plant.plantCode]
        );
        if (!apt) continue;

        await postgresDataSource.query(
          `INSERT INTO appointment_details ("appointmentId", "customerName", "customerPhone", "customerEmail", "vehicleDomain", "vehicleBrand", "vehicleModel", "vehicleYear", "vehicleFuel", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
           ON CONFLICT ("appointmentId") DO NOTHING`,
          [apt.id, d.nombre, d.telefono, d.email, d.dominio, d.marca, d.modelo, d.anio, d.combustible]
        );
        detMigrated++;
        if (detMigrated % 1000 === 0) console.log(`  ... ${detMigrated}`);
      }
      console.log(`  ✅ ${detMigrated} detalles migrados`);
      totalDetails += detMigrated;

      // PAGOS
      console.log('\n💰 Migrando pagos...');
      const cobros = await mysqlDS.query(`SELECT * FROM cobros`);
      console.log(`  ✓ ${cobros.length} registros en MySQL`);

      let payMigrated = 0;
      let paySkipped = 0;
      for (const c of cobros) {
        if (!c.importe || c.importe === null) {
          paySkipped++;
          continue;
        }
        const [apt] = await postgresDataSource.query(
          `SELECT id FROM appointments WHERE "legacyTurnoId" = $1 AND "legacyPlant" = $2`,
          [c.id_turno, plant.plantCode]
        );
        if (!apt) continue;

        await postgresDataSource.query(
          `INSERT INTO payments ("appointmentId", "paymentDate", "amount", "currency", "method", "externalPaymentId", "status", "origin", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [apt.id, c.fecha, c.importe, 'ARS', c.forma_pago || 'unknown', c.id_pago_externo, 'approved', 'T']
        );
        payMigrated++;
        if (payMigrated % 1000 === 0) console.log(`  ... ${payMigrated}`);
      }
      if (paySkipped > 0) console.log(`  ⚠️  ${paySkipped} pagos saltados (sin importe)`);
      console.log(`  ✅ ${payMigrated} pagos migrados`);
      totalPayments += payMigrated;

    } finally {
      await mysqlDS.destroy();
    }
  }

  // LASHERAS - SOLO PAGOS
  console.log('='.repeat(70));
  console.log('🏭 LASHERAS (solo pagos)');
  console.log('='.repeat(70));

  const lasherasDS = new DataSource({
    type: 'mysql',
    host: 'localhost',
    port: 3307,
    username: 'adminlhrevitotal',
    password: 'YnWL@fdA6fRk3@xI6VGM3K',
    database: 'lhrevitotal',
  });

  await lasherasDS.initialize();
  
  console.log('\n💰 Migrando pagos...');
  const cobros = await lasherasDS.query(`SELECT * FROM cobros`);
  console.log(`  ✓ ${cobros.length} registros en MySQL`);

  let payMigrated = 0;
  let paySkipped = 0;
  for (const c of cobros) {
    if (!c.importe || c.importe === null) {
      paySkipped++;
      continue;
    }
    const [apt] = await postgresDataSource.query(
      `SELECT id FROM appointments WHERE "legacyTurnoId" = $1 AND "legacyPlant" = $2`,
      [c.id_turno, 'lasheras']
    );
    if (!apt) continue;

    await postgresDataSource.query(
      `INSERT INTO payments ("appointmentId", "paymentDate", "amount", "currency", "method", "externalPaymentId", "status", "origin", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [apt.id, c.fecha, c.importe, 'ARS', c.forma_pago || 'unknown', c.id_pago_externo, 'approved', 'T']
    );
    payMigrated++;
    if (payMigrated % 1000 === 0) console.log(`  ... ${payMigrated}`);
  }
  if (paySkipped > 0) console.log(`  ⚠️  ${paySkipped} pagos saltados (sin importe)`);
  console.log(`  ✅ ${payMigrated} pagos migrados`);
  totalPayments += payMigrated;

  await lasherasDS.destroy();
  await postgresDataSource.destroy();

  console.log('\n' + '='.repeat(70));
  console.log('✅ COMPLETADO');
  console.log(`📋 Detalles: ${totalDetails}`);
  console.log(`💰 Pagos: ${totalPayments}`);
  console.log('='.repeat(70));
}

migrateMissingDetailsAndPayments()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
