import * as mysql from 'mysql2/promise';

// Conexión vía SSH tunnel: ssh -L 3307:localhost:3306 reviturnos@157.230.90.227
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

async function validatePlantData(plant: typeof PLANTS[0]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PLANTA: ${plant.code.toUpperCase()}`);
  console.log(`Base de datos: ${plant.mysqlDatabase}`);
  console.log('='.repeat(60));

  let connection: mysql.Connection | null = null;

  try {
    // Conectar a MySQL
    connection = await mysql.createConnection({
      host: plant.mysqlHost,
      port: plant.mysqlPort,
      user: plant.mysqlUser,
      password: plant.mysqlPassword,
      database: plant.mysqlDatabase,
    });

    console.log('✅ Conexión exitosa\n');

    // 1. Verificar tabla days (horarios)
    const [dayRows] = await connection.query('SELECT COUNT(*) as count FROM days');
    console.log(`📅 Horarios (days): ${(dayRows as any)[0].count} registros`);

    const [daySample] = await connection.query('SELECT * FROM days LIMIT 1');
    if ((daySample as any[]).length > 0) {
      console.log('   Ejemplo:', JSON.stringify((daySample as any)[0], null, 2));
    }

    // 2. Verificar tabla feriados
    const [feriadoRows] = await connection.query('SELECT COUNT(*) as count FROM feriados');
    console.log(`\n🎉 Feriados: ${(feriadoRows as any)[0].count} registros`);

    const [feriadoSample] = await connection.query('SELECT * FROM feriados ORDER BY feriado DESC LIMIT 3');
    if ((feriadoSample as any[]).length > 0) {
      console.log('   Próximos feriados:');
      (feriadoSample as any[]).forEach((f: any) => {
        console.log(`     - ${f.feriado}: ${f.descripcion}`);
      });
    }

    // 3. Verificar tabla francos (días no laborables)
    const [francoRows] = await connection.query('SELECT COUNT(*) as count FROM francos');
    console.log(`\n🚫 Francos: ${(francoRows as any)[0].count} registros`);

    // 4. Verificar tabla configs (configuración SMTP, etc)
    const [configRows] = await connection.query('SELECT * FROM configs LIMIT 1');
    if ((configRows as any[]).length > 0) {
      const config = (configRows as any)[0];
      console.log(`\n⚙️  Configuración:`);
      console.log(`   SMTP: ${config.server_mail || 'N/A'}`);
      console.log(`   Email: ${config.user_mail || 'N/A'}`);
      console.log(`   Teléfono: ${config.telefono || 'N/A'}`);
    }

    // 5. Verificar turnos (turnos activos)
    const [turnosCount] = await connection.query(
      `SELECT COUNT(*) as count FROM turnos WHERE estado IN ('P','C','T') AND fecha >= CURDATE()`
    );
    console.log(`\n📋 Turnos activos a migrar: ${(turnosCount as any)[0].count} registros`);
    console.log(`   (Solo estados P=Pagado, C=Confirmado, T=Completado)`);

    // Contar por estado
    const [turnosByEstado] = await connection.query(
      `SELECT estado, COUNT(*) as count FROM turnos WHERE fecha >= CURDATE() GROUP BY estado`
    );
    console.log(`\n   Distribución por estado:`);
    (turnosByEstado as any[]).forEach((row: any) => {
      const estadoName = { P: 'Pagado', C: 'Confirmado', T: 'Completado', R: 'Reservado', A: 'Disponible' }[row.estado] || row.estado;
      console.log(`     ${estadoName} (${row.estado}): ${row.count}`);
    });

    // 6. Ver un turno de ejemplo
    const [turnoSample] = await connection.query(
      `SELECT * FROM turnos WHERE estado IN ('P','C','T') AND fecha >= CURDATE() LIMIT 1`
    );
    if ((turnoSample as any[]).length > 0) {
      console.log(`\n   Ejemplo de turno:`, JSON.stringify((turnoSample as any)[0], null, 2));
    }

    // 7. Verificar tabla lunes (lunes no laborables)
    try {
      const [lunesRows] = await connection.query('SELECT COUNT(*) as count FROM lunes');
      console.log(`\n🗓️  Lunes no laborables: ${(lunesRows as any)[0].count} registros`);
    } catch (e) {
      console.log(`\n🗓️  Lunes no laborables: Tabla no encontrada`);
    }

    // 8. Verificar tabla fds (fin de semana laborables)
    try {
      const [fdsRows] = await connection.query('SELECT COUNT(*) as count FROM fds');
      console.log(`📆 Fines de semana laborables: ${(fdsRows as any)[0].count} registros`);
    } catch (e) {
      console.log(`📆 Fines de semana laborables: Tabla no encontrada`);
    }

    console.log('\n✅ Validación completada para ' + plant.code);

  } catch (error) {
    console.error(`❌ Error validando ${plant.code}:`, error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('   No se pudo conectar al servidor MySQL');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   Credenciales incorrectas');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('   Base de datos no existe');
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function main() {
  console.log('\n🔍 VALIDACIÓN DE DATOS - MIGRACIÓN REVITURNOS');
  console.log('Fecha:', new Date().toLocaleString('es-AR'));
  console.log('\nVerificando acceso y datos en las 3 bases MySQL...\n');

  for (const plant of PLANTS) {
    await validatePlantData(plant);
  }

  console.log('\n' + '='.repeat(60));
  console.log('VALIDACIÓN COMPLETA');
  console.log('='.repeat(60));
}

main().catch(console.error);
