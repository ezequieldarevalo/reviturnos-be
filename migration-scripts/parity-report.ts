import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';

type PlantCfg = {
  code: 'lasheras' | 'maipu' | 'godoycruz';
  mysqlDb: string;
};

const plants: PlantCfg[] = [
  { code: 'lasheras', mysqlDb: 'lhrevitotal' },
  { code: 'maipu', mysqlDb: 'marevitotal' },
  { code: 'godoycruz', mysqlDb: 'rtogc' },
];

const pg = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5433,
  username: 'reviturnos',
  password: 'reviturnos_password_2026',
  database: 'reviturnos',
});

async function mysqlConn(db: string) {
  return mysql.createConnection({
    host: '127.0.0.1',
    port: 3308,
    user: 'root',
    password: 'reviturnos_mysql_root_2026',
    database: db,
  });
}

async function run() {
  await pg.initialize();

  console.log('\n=== PARITY REPORT: PHP(MySQL) vs NestJS(PostgreSQL) ===\n');

  for (const plant of plants) {
    const my = await mysqlConn(plant.mysqlDb);

    try {
      const firstRow = async (sql: string) => {
        const [rows]: any = await my.query(sql);
        return rows[0];
      };

      const myTurnos: any = await firstRow('SELECT COUNT(*) c FROM turnos');
      const myDatos: any = await firstRow('SELECT COUNT(*) c FROM datos_turno');
      const myCobros: any = await firstRow('SELECT COUNT(*) c FROM cobros');
      const mySinLinea: any = await firstRow('SELECT COUNT(*) c FROM turnos WHERE id_linea IS NULL OR id_linea = 0');
      const myCobrosSinMonto: any = await firstRow('SELECT COUNT(*) c FROM cobros WHERE monto IS NULL');

      const pgFirstRow = async (sql: string, params: any[] = []) => {
        const rows: any = await pg.query(sql, params);
        return rows[0];
      };

      const pgApt: any = await pgFirstRow(
        'SELECT COUNT(*)::int c FROM appointments WHERE "legacyPlant" = $1',
        [plant.code],
      );
      const pgDet: any = await pgFirstRow(
        'SELECT COUNT(*)::int c FROM appointment_details ad JOIN appointments a ON ad."appointmentId" = a.id WHERE a."legacyPlant" = $1',
        [plant.code],
      );
      const pgPay: any = await pgFirstRow(
        'SELECT COUNT(*)::int c FROM payments p JOIN appointments a ON p."appointmentId" = a.id WHERE a."legacyPlant" = $1',
        [plant.code],
      );

      const mySum: any = await firstRow('SELECT COALESCE(SUM(monto),0) s FROM cobros WHERE monto IS NOT NULL');
      const pgSum: any = await pgFirstRow(
        'SELECT COALESCE(SUM(p.amount),0)::numeric(14,2) s FROM payments p JOIN appointments a ON p."appointmentId" = a.id WHERE a."legacyPlant" = $1',
        [plant.code],
      );

      console.log(`PLANTA ${plant.code.toUpperCase()}`);
      console.log(`  turnos      mysql=${myTurnos.c} | pg=${pgApt.c} | diff=${myTurnos.c - pgApt.c}`);
      console.log(`  detalles    mysql=${myDatos.c} | pg=${pgDet.c} | diff=${myDatos.c - pgDet.c}`);
      console.log(`  pagos       mysql=${myCobros.c} | pg=${pgPay.c} | diff=${myCobros.c - pgPay.c}`);
      console.log(`  monto total mysql=${mySum.s} | pg=${pgSum.s}`);
      console.log(`  fuente: turnos sin línea=${mySinLinea.c}, cobros sin monto=${myCobrosSinMonto.c}`);

      const sample = await pg.query(
        `SELECT a."legacyTurnoId", a."appointmentDate", a."appointmentTime", a.status, a.origin
         FROM appointments a
         WHERE a."legacyPlant" = $1
         ORDER BY a."legacyTurnoId" DESC
         LIMIT 3`,
        [plant.code],
      );
      console.log('  muestra pg:', sample);
      console.log('');
    } finally {
      await my.end();
    }
  }

  await pg.destroy();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
