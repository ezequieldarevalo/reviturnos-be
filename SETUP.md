# 🚀 Setup Rápido - ReviTurnos Backend

## 1. Instalación

```bash
cd reviturnos-backend
npm install
```

## 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` si necesitas cambiar algo (por defecto funciona con Docker)

## 3. Levantar base de datos (PostgreSQL + Redis)

```bash
docker-compose up -d
```

Verifica que estén corriendo:
```bash
docker ps
```

Deberías ver:
- `reviturnos-postgres` (Puerto 5432)
- `reviturnos-redis` (Puerto 6379)

## 4. Sincronizar schema de base de datos

```bash
# TypeORM creará las tablas automáticamente
npm run start:dev
```

## 5. Cargar datos iniciales (seeds)

En otra terminal:
```bash
npm run seed
```

Esto creará:
- ✅ 5 plantas (lasheras, maipu, godoycruz, rivadavia, sanmartin)
- ✅ Precios por tipo de vehículo
- ✅ Usuarios admin (admin@{planta}.com / admin123)

## 6. Probar la API

La API estará en: `http://localhost:3000/api`

### Test con cURL:

```bash
# Obtener turnos disponibles (Las Heras)
curl -X POST http://localhost:3000/api/auth/getQuotes \
  -H "Content-Type: application/json" \
  -H "X-Plant-Code: lasheras" \
  -d '{"tipoVehiculo":"AUTO PARTICULAR"}'

# Login admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Plant-Code: lasheras" \
  -d '{"email":"admin@lasheras.com","password":"admin123"}'
```

## 7. Próximos pasos

1. **Generar turnos disponibles**: Necesitas crear un script que inserte turnos disponibles en la tabla `appointments`
2. **Implementar integraciones de pago**: Yacare y MercadoPago
3. **Implementar envío de emails**: Configurar SMTP
4. **Tests**: Correr los tests E2E

---

## 📝 Datos de Test

### Usuarios Admin:
- **Las Heras**: admin@lasheras.com / admin123
- **Maipú**: admin@maipu.com / admin123
- **Godoy Cruz**: admin@godoycruz.com / admin123
- **Rivadavia**: admin@rivadavia.com / admin123
- **San Martín**: admin@sanmartin.com / admin123

### Identificación de Planta:

El sistema detecta la planta por:
1. Header `X-Plant-Code: lasheras`
2. O subdomain: `lasheras.api.reviturnos.com.ar`
3. O path: `/api/lasheras/auth/...`

---

## 🐛 Troubleshooting

### Error: Cannot connect to database
```bash
# Revisar que Docker esté corriendo
docker ps

# Ver logs de PostgreSQL
docker logs reviturnos-postgres

# Restart containers
docker-compose restart
```

### Error: Port 5432 already in use
```bash
# Si ya tienes PostgreSQL local, cambia el puerto en docker-compose.yml:
# ports:
#   - "5433:5432"  # Cambiar 5432 a 5433

# Y actualiza .env:
# DB_PORT=5433
```

---

## 🎯 Endpoints Implementados

✅ **Públicos** (No requieren auth):
- POST `/api/auth/getQuotes`
- POST `/api/auth/confQuote`
- POST `/api/auth/getQuotesForResc`
- POST `/api/auth/getQuoteForCancel`
- POST `/api/auth/changeDate`
- POST `/api/auth/cancelQuote`
- POST `/api/auth/notif` (Webhook Yacare)
- POST `/api/auth/notifMeli` (Webhook MercadoPago)

✅ **Autenticados** (Requieren Bearer token):
- POST `/api/auth/login`
- GET `/api/auth/user`
- GET `/api/auth/logout`
- GET `/api/auth/turDiaAct`
- GET `/api/auth/turDiaFut`

---

¡Listo! El backend está funcionando 🎉
