import * as mysql from 'mysql2/promise';

const PLANTS = [
  { code: 'lasheras', host: 'localhost', port: 3307, user: 'adminlhrevitotal', password: 'YnWL@fdA6fRk3@xI6VGM3K', database: 'lhrevitotal' },
  { code: 'maipu', host: 'localhost', port: 3307, user: 'adminmarevitotal', password: 't4nx31Fm]ha-i{NITBtM', database: 'marevitotal' },
  { code: 'godoycruz', host: 'localhost', port: 3307, user: 'adminrtogc', password: 'vq:oaDyHYKG2Gf+xWI5%', database: 'rtogc' },
];

async function main() {
  console.log('\n📊 Conteo de datos desde 2025-01-01\n');

  for (const plant of PLANTS) {
    const conn = await mysql.createConnection(plant);
    
    try {
      const [turnos]: any = await conn.query(`SELECT COUNT(*) as total FROM turnos WHERE estado IN ('P', 'C', 'T') AND fecha >= '2025-01-01'`);
      const [pagos]: any = await conn.query(`SELECT COUNT(*) as total FROM cobros c INNER JOIN turnos t ON t.id = c.id_turno WHERE t.estado IN ('P', 'C', 'T') AND t.fecha >= '2025-01-01'`);
      
      console.log(`${plant.code.toUpperCase()}:`);
      console.log(`  Turnos: ${turnos[0].total}`);
      console.log(`  Pagos: ${pagos[0].total}`);
      console.log('');
    } finally {
      await conn.end();
    }
  }
}

main().catch(console.error);
