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
    // Turnos con pago en MySQL
    const [turnosConPago]: any = await conn.query(`
      SELECT 
        t.fecha,
        t.hora,
        t.estado,
        c.monto,
        c.metodo
      FROM turnos t
      INNER JOIN cobros c ON c.id_turno = t.id
      WHERE t.estado IN ('P', 'C', 'T')
        AND t.fecha >= '2025-01-01'
      ORDER BY t.fecha DESC, t.hora DESC
      LIMIT 20
    `);
    
    console.log('\n📄 Sample de turnos CON PAGO en MySQL:\n');
    turnosConPago.forEach((t: any) => {
      console.log(`${t.fecha.toISOString().split('T')[0]} ${t.hora} - ${t.estado} - $${t.monto} - ${t.metodo}`);
    });

    // Distribución de horarios
    const [distribucion]: any = await conn.query(`
      SELECT 
        t.hora,
        COUNT(*) as cantidad
      FROM turnos t
      INNER JOIN cobros c ON c.id_turno = t.id
      WHERE t.estado IN ('P', 'C', 'T')
        AND t.fecha >= '2025-01-01'
      GROUP BY t.hora
      ORDER BY cantidad DESC
      LIMIT 20
    `);
    
    console.log('\n📊 Distribución de horarios de turnos con pago:\n');
    distribucion.forEach((d: any) => {
      console.log(`${d.hora} - ${d.cantidad} turnos`);
    });

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
