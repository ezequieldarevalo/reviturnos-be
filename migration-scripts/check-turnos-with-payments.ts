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
    console.log('\n📄 Turnos con pagos:\n');
    const [turnos] = await conn.query(`
      SELECT 
        t.id, t.fecha, t.hora, t.estado,
        c.id as cobro_id, c.monto, c.metodo, c.fecha as cobro_fecha
      FROM turnos t
      INNER JOIN cobros c ON c.id_turno = t.id
      WHERE t.estado IN ('P', 'C', 'T')
        AND t.fecha >= CURDATE()
      LIMIT 5
    `);
    console.table(turnos);

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
