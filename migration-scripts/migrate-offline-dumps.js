const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { Pool } = require('pg');

function loadEnv(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function toTime(v) {
  if (!v) return '00:00:00';
  if (typeof v === 'string') return v.length === 5 ? `${v}:00` : v;
  const s = String(v).padStart(6, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

function formatHm(n) {
  if (!n) return '00:00';
  const s = String(n).padStart(4, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

function mapStatus(st) {
  const s = String(st || 'D').toUpperCase().slice(0, 1);
  return ['D', 'R', 'C', 'P', 'T', 'X'].includes(s) ? s : 'D';
}

function mapOrigin(o) {
  const s = String(o || 'T').toUpperCase().slice(0, 1);
  return s === 'A' ? 'A' : 'T';
}

function parseLegacyDate(v) {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  const s = String(v).trim();
  if (/^\d{2}-\d{2}-\d{4}/.test(s)) {
    const [d, m, y, hh = '00', mm = '00', ss = '00'] = s.split(/[- :]/);
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`);
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

function transformConfig(oldCfg) {
  const firstMonth = oldCfg.days?.[0] || {};
  const map = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const schedules = {};
  for (let i = 0; i < 7; i++) {
    const from = firstMonth[`${map[i]}_desde`];
    const to = firstMonth[`${map[i]}_hasta`];
    if (from && to) {
      schedules[names[i]] = { from: formatHm(from), to: formatHm(to), slotsPerHour: 4 };
    }
  }

  const holidays = [];
  for (const f of oldCfg.feriados || []) if (f.fecha) holidays.push(String(f.fecha).slice(0, 10));
  for (const l of oldCfg.lunes || []) if (l.fecha) holidays.push(String(l.fecha).slice(0, 10));

  const nonWorkingDays = [];
  for (const f of oldCfg.francos || []) if (f.dia !== undefined) nonWorkingDays.push(Number(f.dia));
  for (const f of oldCfg.fds || []) if (f.nro_dia !== undefined) nonWorkingDays.push(Number(f.nro_dia));

  return {
    schedules,
    holidays: [...new Set(holidays)],
    nonWorkingDays: [...new Set(nonWorkingDays)].sort((a, b) => a - b),
    payment: {
      expirationMinutes: 120,
      cashExpirationMinutes: 2880,
      marginPostCashPaymentMinutes: 120,
      validatePendingQuotes: false,
      requiresPayment: true,
    },
    business: {
      ignoreVehicleLines: false,
      daysAvailableInAdvance: oldCfg.config?.cant_dias_disponibles || 30,
    },
    integrations: {
      mercadopago: { enabled: true, excludedPaymentMethods: [] },
      rto: { enabled: true, confirmQuotes: false },
    },
  };
}

async function bulkInsert(pg, table, columns, rows, conflictClause = '') {
  if (!rows.length) return;
  const chunk = 800;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const values = [];
    let p = 1;
    for (const row of part) {
      values.push(`(${columns.map(() => `$${p++}`).join(',')})`);
      params.push(...row);
    }
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')} ${conflictClause}`;
    await pg.query(sql, params);
  }
}

function pct(part, total) {
  if (!total) return '0.0';
  return ((part / total) * 100).toFixed(1);
}

async function main() {
  const env = loadEnv(path.join(__dirname, '..', '.env'));
  const pg = new Pool({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });

  const plants = [
    { code: 'lasheras', name: 'Revitotal - Las Heras', db: 'lhrevitotal' },
    { code: 'maipu', name: 'Revitotal - Maipu', db: 'marevitotal' },
    { code: 'godoycruz', name: 'RTVO Centro Express - Godoy Cruz', db: 'rtogc' },
  ];

  const mysqlCfg = {
    host: process.env.LEGACY_MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.LEGACY_MYSQL_PORT || 3306),
    user: process.env.LEGACY_MYSQL_USER || 'legacy_migrator',
    password: process.env.LEGACY_MYSQL_PASSWORD || 'legacy_migrator_2026',
  };

  console.log('Preparing target schema...');
  await pg.query('ALTER TABLE inspection_lines ADD COLUMN IF NOT EXISTS "legacyLineId" bigint');
  await pg.query('CREATE UNIQUE INDEX IF NOT EXISTS "uq_inspection_lines_plant_legacy" ON inspection_lines ("plantId", "legacyLineId")');
  await pg.query('CREATE UNIQUE INDEX IF NOT EXISTS "uq_pricing_plant_vehicle" ON pricing ("plantId", "vehicleType")');
  await pg.query('CREATE UNIQUE INDEX IF NOT EXISTS "uq_appointments_legacy" ON appointments ("legacyPlant", "legacyTurnoId")');
  await pg.query('DROP INDEX IF EXISTS "uq_payments_appointment_external"');

  const plantCodes = plants.map((p) => p.code);
  console.log('Cleaning existing target data for:', plantCodes.join(', '));
  await pg.query('DELETE FROM appointment_details ad USING appointments a, plants p WHERE ad."appointmentId"=a.id AND a."plantId"=p.id AND p.code = ANY($1)', [plantCodes]);
  await pg.query('DELETE FROM payments py USING appointments a, plants p WHERE py."appointmentId"=a.id AND a."plantId"=p.id AND p.code = ANY($1)', [plantCodes]);
  await pg.query('DELETE FROM appointments a USING plants p WHERE a."plantId"=p.id AND p.code = ANY($1)', [plantCodes]);
  await pg.query('DELETE FROM inspection_lines l USING plants p WHERE l."plantId"=p.id AND p.code = ANY($1)', [plantCodes]);
  await pg.query('DELETE FROM pricing r USING plants p WHERE r."plantId"=p.id AND p.code = ANY($1)', [plantCodes]);
  await pg.query('DELETE FROM users u USING plants p WHERE u."plantId"=p.id AND p.code = ANY($1)', [plantCodes]);
  await pg.query('DELETE FROM plants WHERE code = ANY($1)', [plantCodes]);

  for (const plant of plants) {
    console.log(`\n=== ${plant.code.toUpperCase()} ===`);
    const my = await mysql.createConnection({ ...mysqlCfg, database: plant.db });

    console.log(`[${plant.code}] Loading base tables...`);
    const [precios] = await my.query('SELECT * FROM precios ORDER BY id');
    const [lineas] = await my.query('SELECT * FROM lineas ORDER BY id');
    const [days] = await my.query('SELECT * FROM days ORDER BY id');
    const [feriados] = await my.query('SELECT * FROM feriados WHERE fecha >= CURDATE()');
    const [francos] = await my.query('SELECT * FROM francos');
    const [configs] = await my.query('SELECT * FROM configs LIMIT 1');
    let fds = [];
    let lunes = [];
    try { [fds] = await my.query('SELECT * FROM fds'); } catch {}
    try { [lunes] = await my.query('SELECT * FROM lunes'); } catch {}

    console.log(
      `[${plant.code}] Source counts => precios=${precios.length}, lineas=${lineas.length}, days=${days.length}, feriados=${feriados.length}, francos=${francos.length}`,
    );

    const config = transformConfig({ days, feriados, francos, config: configs?.[0] || {}, fds, lunes });

    const plantResult = await pg.query(
      'INSERT INTO plants (code,name,slug,active,config,"createdAt","updatedAt") VALUES ($1,$2,$3,true,$4,NOW(),NOW()) RETURNING id',
      [plant.code, plant.name, plant.code, config],
    );
    const plantId = plantResult.rows[0].id;

    const codeToDesc = new Map();
    const codeToPrice = new Map();
    for (const p of precios) {
      const code = String(p.tipo_vehiculo || '').trim();
      const desc = String(p.descripcion || code).trim().toUpperCase();
      if (code) {
        codeToDesc.set(code, desc);
        codeToPrice.set(code, Number(p.precio || 0));
      }
    }

    const pricing = [];
    const seenVehicle = new Set();
    for (const p of precios) {
      const vt = String(p.descripcion || p.tipo_vehiculo || '').trim().toUpperCase();
      if (!vt || seenVehicle.has(vt)) continue;
      seenVehicle.add(vt);
      pricing.push([plantId, vt, String(p.descripcion || vt), Number(p.precio || 0), 'ARS', new Date()]);
    }
    await bulkInsert(
      pg,
      'pricing',
      ['"plantId"', '"vehicleType"', 'description', 'price', 'currency', '"validFrom"'],
      pricing,
      'ON CONFLICT ("plantId","vehicleType") DO UPDATE SET description=EXCLUDED.description, price=EXCLUDED.price, "updatedAt"=NOW()',
    );
    console.log(`[${plant.code}] Pricing upserted: ${pricing.length}`);

    const lines = [];
    for (const l of lineas) {
      const code = String(l.tipo_vehiculo || '').trim();
      const vt = codeToDesc.get(code) || code || 'AUTO PARTICULAR';
      const timeSlots = {
        workday: {
          from1: formatHm(l.desde_franja_1),
          to1: formatHm(l.hasta_franja_1),
          from2: formatHm(l.desde_franja_2),
          to2: formatHm(l.hasta_franja_2),
        },
        weekend: {
          from1: formatHm(l.desde_franja_1_fds),
          to1: formatHm(l.hasta_franja_1_fds),
          from2: formatHm(l.desde_franja_2_fds),
          to2: formatHm(l.hasta_franja_2_fds),
        },
      };
      lines.push([
        plantId,
        String(l.nombre || `Linea ${l.id}`),
        vt,
        Number(l.tope_por_hora_1 || 4),
        Number(l.tope_por_hora_2 || 0) || null,
        Number(l.max_dias_disponibles || 30),
        JSON.stringify(timeSlots),
        true,
        Number(l.id),
      ]);
    }

    await bulkInsert(
      pg,
      'inspection_lines',
      ['"plantId"', 'name', '"vehicleType"', '"maxAppointmentsPerHour"', '"maxAppointmentsPerHourSecondary"', '"maxDaysAvailable"', '"timeSlots"', 'active', '"legacyLineId"'],
      lines,
      'ON CONFLICT ("plantId","legacyLineId") DO UPDATE SET name=EXCLUDED.name, "vehicleType"=EXCLUDED."vehicleType", "maxAppointmentsPerHour"=EXCLUDED."maxAppointmentsPerHour", "maxAppointmentsPerHourSecondary"=EXCLUDED."maxAppointmentsPerHourSecondary", "maxDaysAvailable"=EXCLUDED."maxDaysAvailable", "timeSlots"=EXCLUDED."timeSlots", active=EXCLUDED.active, "updatedAt"=NOW()',
    );
    console.log(`[${plant.code}] Lines upserted: ${lines.length}`);

    const lineMapRows = await pg.query('SELECT id, "legacyLineId" FROM inspection_lines WHERE "plantId"=$1', [plantId]);
    const lineMap = new Map(lineMapRows.rows.map((r) => [Number(r.legacyLineId), r.id]));

    const [turnosCountRows] = await my.query('SELECT COUNT(*) AS c FROM turnos');
    const totalTurnosSource = Number(turnosCountRows[0]?.c || 0);
    console.log(`[${plant.code}] Appointments source total: ${totalTurnosSource}`);

    let lastId = 0;
    let totalAppointments = 0;
    let processedTurnos = 0;
    while (true) {
      const [turnos] = await my.query('SELECT * FROM turnos WHERE id > ? ORDER BY id ASC LIMIT 5000', [lastId]);
      if (!turnos.length) break;
      lastId = Number(turnos[turnos.length - 1].id);
      processedTurnos += turnos.length;

      const apptRows = turnos.map((t) => [
        plantId,
        lineMap.get(Number(t.id_linea)) || null,
        t.fecha,
        toTime(t.hora),
        mapStatus(t.estado),
        mapOrigin(t.origen),
        t.vencimiento || null,
        t.observaciones || null,
        t.id_cobro_yac || null,
        Number(t.id),
        plant.code,
        t.created_at || new Date(),
        t.updated_at || new Date(),
      ]);

      await bulkInsert(
        pg,
        'appointments',
        ['"plantId"', '"lineId"', '"appointmentDate"', '"appointmentTime"', 'status', 'origin', '"expiresAt"', 'observations', '"paymentId"', '"legacyTurnoId"', '"legacyPlant"', '"createdAt"', '"updatedAt"'],
        apptRows,
        'ON CONFLICT ("legacyPlant","legacyTurnoId") DO NOTHING',
      );

      totalAppointments += apptRows.length;
      if (processedTurnos % 25000 === 0 || processedTurnos === totalTurnosSource) {
        console.log(
          `[${plant.code}] appointments ${processedTurnos}/${totalTurnosSource} (${pct(processedTurnos, totalTurnosSource)}%)`,
        );
      }
    }

    const aptMapRows = await pg.query('SELECT id, "legacyTurnoId" FROM appointments WHERE "plantId"=$1 AND "legacyTurnoId" IS NOT NULL', [plantId]);
    const aptMap = new Map(aptMapRows.rows.map((r) => [Number(r.legacyTurnoId), r.id]));

    const [datosCountRows] = await my.query('SELECT COUNT(*) AS c FROM datos_turno');
    const totalDatosSource = Number(datosCountRows[0]?.c || 0);
    console.log(`[${plant.code}] Details source total: ${totalDatosSource}`);

    const [datos] = await my.query('SELECT * FROM datos_turno ORDER BY id');
    const detailsByAppointment = new Map();
    let detailsProcessed = 0;
    for (const d of datos) {
      detailsProcessed++;
      const appointmentId = aptMap.get(Number(d.id_turno));
      if (!appointmentId) continue;
      const code = String(d.tipo_vehiculo || '').trim();
      detailsByAppointment.set(appointmentId, [
        appointmentId,
        String(d.nombre || ''),
        String(d.email || ''),
        String(d.telefono || ''),
        String(d.dominio || ''),
        codeToDesc.get(code) || String(d.tipo_vehiculo || ''),
        String(d.marca || ''),
        String(d.modelo || ''),
        d.anio ? Number(d.anio) : null,
        String(d.combustible || ''),
        String(d.inscr_mendoza || '').toLowerCase() === 'si',
        d.nro_turno_rto ? String(d.nro_turno_rto) : null,
        Number(codeToPrice.get(code) || 0),
      ]);

      if (detailsProcessed % 10000 === 0 || detailsProcessed === totalDatosSource) {
        console.log(
          `[${plant.code}] details read ${detailsProcessed}/${totalDatosSource} (${pct(detailsProcessed, totalDatosSource)}%)`,
        );
      }
    }

    const details = Array.from(detailsByAppointment.values());

    await bulkInsert(
      pg,
      'appointment_details',
      ['"appointmentId"', '"customerName"', '"customerEmail"', '"customerPhone"', '"vehicleDomain"', '"vehicleType"', '"vehicleBrand"', '"vehicleModel"', '"vehicleYear"', '"vehicleFuel"', '"registeredInMendoza"', '"rtoAppointmentNumber"', 'price'],
      details,
      'ON CONFLICT ("appointmentId") DO UPDATE SET "customerName"=EXCLUDED."customerName", "customerEmail"=EXCLUDED."customerEmail", "customerPhone"=EXCLUDED."customerPhone", "vehicleDomain"=EXCLUDED."vehicleDomain", "vehicleType"=EXCLUDED."vehicleType", "vehicleBrand"=EXCLUDED."vehicleBrand", "vehicleModel"=EXCLUDED."vehicleModel", "vehicleYear"=EXCLUDED."vehicleYear", "vehicleFuel"=EXCLUDED."vehicleFuel", "registeredInMendoza"=EXCLUDED."registeredInMendoza", "rtoAppointmentNumber"=EXCLUDED."rtoAppointmentNumber", price=EXCLUDED.price, "updatedAt"=NOW()',
    );
    console.log(`[${plant.code}] Details upserted: ${details.length}`);

    const [cobrosCountRows] = await my.query('SELECT COUNT(*) AS c FROM cobros');
    const totalCobrosSource = Number(cobrosCountRows[0]?.c || 0);
    console.log(`[${plant.code}] Payments source total: ${totalCobrosSource}`);

    const [cobros] = await my.query('SELECT * FROM cobros ORDER BY id');
    const paymentsByKey = new Map();
    let paymentsProcessed = 0;
    for (const c of cobros) {
      paymentsProcessed++;
      const appointmentId = aptMap.get(Number(c.id_turno));
      if (!appointmentId || c.monto === null || c.monto === undefined) continue;
      const externalPaymentId = c.id_cobro ? String(c.id_cobro) : null;
      const key = `${appointmentId}__${externalPaymentId || 'null'}__${String(c.fecha || '')}__${String(c.monto || '')}`;
      paymentsByKey.set(key, [
        appointmentId,
        parseLegacyDate(c.fecha),
        Number(c.monto || 0),
        'ARS',
        String(c.metodo || 'legacy'),
        'approved',
        mapOrigin(c.origen),
        externalPaymentId,
        'legacy',
      ]);

      if (paymentsProcessed % 10000 === 0 || paymentsProcessed === totalCobrosSource) {
        console.log(
          `[${plant.code}] payments read ${paymentsProcessed}/${totalCobrosSource} (${pct(paymentsProcessed, totalCobrosSource)}%)`,
        );
      }
    }

    const payments = Array.from(paymentsByKey.values());

    await bulkInsert(
      pg,
      'payments',
      ['"appointmentId"', '"paymentDate"', 'amount', 'currency', 'method', 'status', 'origin', '"externalPaymentId"', 'platform'],
      payments,
    );

    console.log(
      `[${plant.code}] DONE lines=${lines.length}, pricing=${pricing.length}, appointments=${totalAppointments}, details=${details.length}, payments=${payments.length}`,
    );
    await my.end();
  }

  const final = await pg.query(`
    SELECT p.code,
           COUNT(DISTINCT l.id) AS lines,
           COUNT(DISTINCT r.id) AS pricing,
           COUNT(DISTINCT a.id) AS appointments,
           COUNT(DISTINCT d.id) AS details,
           COUNT(DISTINCT py.id) AS payments
    FROM plants p
    LEFT JOIN inspection_lines l ON l."plantId"=p.id
    LEFT JOIN pricing r ON r."plantId"=p.id
    LEFT JOIN appointments a ON a."plantId"=p.id
    LEFT JOIN appointment_details d ON d."appointmentId"=a.id
    LEFT JOIN payments py ON py."appointmentId"=a.id
    WHERE p.code IN ('lasheras','maipu','godoycruz')
    GROUP BY p.code
    ORDER BY p.code
  `);

  console.log('\nFINAL COUNTS');
  console.table(final.rows);

  await pg.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
