import * as mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'adminlhrevitotal',
    password: 'YnWL@fdA6fRk3@xI6VGM3K',
    database: 'lhrevitotal',
  });

  try {
    console.log('\n📊 Estructura de tabla cobros:\n');
    
    const [columns] = await conn.query('DESCRIBE cobros');
    console.table(columns);

    console.log('\n📄 Sample de datos:\n');
    const [samples] = await conn.query('SELECT * FROM cobros LIMIT 3');
    console.table(samples);

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
