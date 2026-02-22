# 🔄 Guía de Migración - Sistema de Turnos

Esta guía explica cómo migrar desde el sistema anterior (Laravel + MySQL × 5 plantas) al nuevo sistema unificado (NestJS + PostgreSQL).

## 📋 Pre-requisitos

1. **Acceso a las bases MySQL antiguas** (5 instancias):
   - `lhrevitotal`
   - `maipurevitotal`
   - `rtogodoycruz`
   - `rtorivadavia`
   - `rtosanmartin`

2. **PostgreSQL corriendo** con base de datos creada:
   ```bash
   docker-compose up -d
   ```

3. **Dependencias instaladas**:
   ```bash
   npm install
   npm install mysql2 --save
   ```

## 🚀 Proceso de Migración

### Paso 1: Crear Estructura Base

```bash
# Crear tablas y datos iniciales (plantas, usuarios, líneas, precios)
npm run seed
```

Esto crea:
- ✅ 5 plantas (lasheras, maipu, godoycruz, rivadavia, sanmartin)
- ✅ 20 líneas de inspección
- ✅ 20 registros de precios
- ✅ 5 usuarios admin (admin@{planta}.com / admin123)

### Paso 2: Migrar Configuraciones

```bash
# Lee Day, Feriado, Franco, Config de MySQL → escribe JSONB en PostgreSQL
npm run migrate:configs
```

**Qué hace:**
- Lee horarios por día de la semana desde tabla `days`
- Lee feriados desde tabla `feriados`
- Lee días no laborables desde `francos`, `fds`, `lunes`
- Transforma a formato JSONB estructurado
- Actualiza columna `config` en tabla `plants`

**Tiempo estimado:** ~2 minutos

**Resultado:**
```json
{
  "schedules": {
    "monday": { "from": "08:00", "to": "17:00", "slotsPerHour": 4 },
    ...
  },
  "holidays": ["2026-01-01", "2026-05-01", ...],
  "nonWorkingDays": [0, 6],
  "business": { "daysAvailableInAdvance": 30 }
}
```

### Paso 3: Migrar Turnos Reservados

```bash
# Migra SOLO turnos confirmados/reservados (NO los disponibles)
npm run migrate:appointments
```

**Qué migra:**
- ✅ Turnos con estado **P** (Pendiente de pago)
- ✅ Turnos con estado **C** (Confirmado)
- ✅ Turnos con estado **T** (Reservado temporalmente)
- ✅ Solo turnos **futuros** (>= fecha actual)
- ✅ Detalles del cliente (`datosturnos`)
- ✅ Pagos asociados (`cobros`)

**Qué NO migra:**
- ❌ Turnos con estado **D** (Disponibles) - se generan dinámicamente
- ❌ Turnos pasados

**Tiempo estimado:** ~5-10 minutos (depende de cantidad de turnos)

### Paso 4: Migración Completa (Opcional)

```bash
# Ejecuta ambos scripts en secuencia
npm run migrate:all
```

## 🔍 Verificación Post-Migración

### 1. Verificar Configuraciones

```sql
-- Conectar a PostgreSQL
psql -U reviturnos_user -d reviturnos_db -h localhost -p 5433

-- Ver configuración de una planta
SELECT code, name, config FROM plants WHERE code = 'lasheras';
```

Debés ver horarios, feriados y nonWorkingDays configurados.

### 2. Verificar Turnos Migrados

```sql
-- Contar turnos por planta
SELECT 
  p.code,
  COUNT(a.id) as total_appointments,
  COUNT(CASE WHEN a.status = 'confirmed' THEN 1 END) as confirmed,
  COUNT(CASE WHEN a.status = 'reserved' THEN 1 END) as reserved
FROM plants p
LEFT JOIN appointments a ON a.plant_id = p.id
GROUP BY p.code;
```

### 3. Probar Generación Dinámica

```bash
# Iniciar servidor
npm run start:dev

# En otro terminal, probar endpoint
curl -X POST http://localhost:3000/api/auth/getQuotes \
  -H "Content-Type: application/json" \
  -H "X-Plant-Code: lasheras" \
  -d '{"tipo_vehiculo": "auto"}'
```

Deberías ver turnos disponibles generados dinámicamente.

## ⚙️ Configuración de Horarios

Si necesitás ajustar horarios después de la migración:

```sql
-- Ejemplo: Cambiar horario de lunes para godoycruz
UPDATE plants 
SET config = jsonb_set(
  config, 
  '{schedules,monday}', 
  '{"from": "07:30", "to": "16:00", "slotsPerHour": 4}'::jsonb
)
WHERE code = 'godoycruz';
```

## 🔄 Rollback (Si algo sale mal)

### Opción 1: Limpiar y reintentar

```bash
# Eliminar turnos migrados
npm run typeorm -- query "DELETE FROM appointment_details; DELETE FROM payments; DELETE FROM appointments;"

# Volver a migrar
npm run migrate:appointments
```

### Opción 2: Recrear todo desde cero

```bash
# Eliminar base de datos
docker-compose down -v

# Recrear
docker-compose up -d
npm run seed
npm run migrate:all
```

## 📊 Comparación de Datos

### Antes (MySQL)
```bash
# Conectar a MySQL viejo
mysql -h 200.61.176.20 -u root -p lhrevitotal

# Contar turnos reservados
SELECT COUNT(*) FROM turnos WHERE estado IN ('P','C','T') AND fecha >= CURDATE();
```

### Después (PostgreSQL)
```sql
-- Contar turnos en nueva base
SELECT COUNT(*) FROM appointments WHERE status IN ('confirmed','reserved','pending');
```

Los números deben coincidir.

## 🎯 Ventajas del Nuevo Sistema

| Aspecto | Antes | Después |
|---------|-------|---------|
| **Turnos en BD** | ~50,000 | ~500 |
| **Generación** | Cron diario | On-demand |
| **Configuración** | 7 tablas | 1 JSON |
| **Cambios** | Regenerar BD | Actualizar JSON |
| **Performance** | Queries lentas | Cálculo rápido |

## 🐛 Troubleshooting

### Error: Cannot connect to MySQL

```bash
# Verificar conectividad
telnet 200.61.176.20 3306

# Verificar credenciales
mysql -h 200.61.176.20 -u root -p
```

### Error: Plant not found in PostgreSQL

```bash
# Verificar que el seed corrió
npm run seed

# Verificar plantas creadas
psql -U reviturnos_user -d reviturnos_db -c "SELECT code FROM plants;"
```

### Turnos no se generan dinámicamente

1. Verificar que `config.schedules` tiene horarios configurados
2. Verificar que hay líneas de inspección activas
3. Verificar que hay precios configurados para el tipo de vehículo

```sql
-- Debug
SELECT * FROM plants WHERE code = 'lasheras';
SELECT * FROM inspection_lines WHERE plant_id = (SELECT id FROM plants WHERE code = 'lasheras');
SELECT * FROM pricing WHERE plant_id = (SELECT id FROM plants WHERE code = 'lasheras');
```

## 📞 Soporte

Si tenés problemas durante la migración, revisá:
1. Los logs de los scripts de migración
2. Los logs del servidor NestJS
3. Los errores de PostgreSQL

## ✅ Checklist Final

- [ ] Seed ejecutado correctamente
- [ ] Configuraciones migradas (5 plantas)
- [ ] Turnos reservados migrados
- [ ] Servidor inicia sin errores
- [ ] Endpoint `/getQuotes` genera turnos dinámicamente
- [ ] Endpoint `/confirmQuote` crea turnos correctamente
- [ ] Emails se envían correctamente
- [ ] Frontend conecta al nuevo backend

¡Listo para producción! 🚀
