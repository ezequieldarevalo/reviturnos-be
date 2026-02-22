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

async function testConnection(plant: typeof PLANTS[0]) {
  try {
    console.log(`\n🔌 Conectando a ${plant.code}...`);
    const connection = await mysql.createConnection({
      host: plant.mysqlHost,
      port: plant.mysqlPort,
      user: plant.mysqlUser,
      password: plant.mysqlPassword,
      database: plant.mysqlDatabase,
    });

    const [rows] = await connection.query('SELECT COUNT(*) as count FROM turnos');
    console.log(`✅ ${plant.code}: Conexión exitosa! Turnos totales: ${(rows as any)[0].count}`);
    
    await connection.end();
    return true;
  } catch (error) {
    console.error(`❌ ${plant.code}: Error - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🧪 TEST DE CONEXIÓN A MYSQL\n');
  
  let allSuccess = true;
  for (const plant of PLANTS) {
    const success = await testConnection(plant);
    if (!success) allSuccess = false;
  }
  
  console.log('\n' + '='.repeat(50));
  if (allSuccess) {
    console.log('✅ Todas las conexiones exitosas!');
    console.log('Podés ejecutar: npm run migrate:configs');
  } else {
    console.log('❌ Algunas conexiones fallaron');
    console.log('Verificá credenciales y acceso de red');
  }
}

main().catch(console.error);
