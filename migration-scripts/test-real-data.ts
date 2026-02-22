import * as mysql from 'mysql2/promise';

function formatTime(hora: number | string): string {
  // Si ya es un string TIME (HH:MM:SS), devolver HH:MM:SS completo
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

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'adminlhrevitotal',
    password: 'YnWL@fdA6fRk3@xI6VGM3K',
    database: 'lhrevitotal',
  });

  try {
    const [turnos]: any = await conn.query(`
      SELECT 
        t.id,
        t.fecha,
        t.hora,
        t.estado,
        l.tipo_vehiculo
      FROM turnos t
      LEFT JOIN lineas l ON l.id = t.id_linea
      WHERE t.estado IN ('P', 'C', 'T')
        AND t.fecha >= '2025-01-01'
      ORDER BY t.fecha DESC, t.hora DESC
      LIMIT 20
    `);
    
    console.log('\n📋 Sample de turnos reales de MySQL:\n');
    console.log('ID\tFecha\t\tHora MySQL\tTipo Hora\tFormateado\tVehiculo');
    console.log('='.repeat(100));
    
    turnos.forEach((t: any) => {
      const tipoHora = typeof t.hora;
      const horaFormateada = formatTime(t.hora);
      const fecha = t.fecha instanceof Date ? t.fecha.toISOString().split('T')[0] : t.fecha;
      console.log(`${t.id}\t${fecha}\t${t.hora}\t\t${tipoHora}\t\t${horaFormateada}\t${t.tipo_vehiculo || 'N/A'}`);
    });

    // Verificar distribución de tipos de hora
    console.log('\n📊 Verificando tipos de dato en columna hora:\n');
    const [sample]: any = await conn.query(`
      SELECT DISTINCT TIME_FORMAT(hora, '%H:%i:%s') as hora_formateada, COUNT(*) as cantidad
      FROM turnos
      WHERE estado IN ('P', 'C', 'T')
        AND fecha >= '2025-01-01'
      GROUP BY TIME_FORMAT(hora, '%H:%i:%s')
      ORDER BY cantidad DESC
      LIMIT 30
    `);
    
    console.log('Hora\t\tCantidad');
    console.log('='.repeat(40));
    sample.forEach((s: any) => {
      console.log(`${s.hora_formateada}\t\t${s.cantidad}`);
    });

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
