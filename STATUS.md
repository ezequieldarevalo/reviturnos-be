# Estado del Proyecto - ReviTurnos Backend

## ✅ Completado

### Infraestructura
- [x] Proyecto NestJS inicializado
- [x] TypeScript configurado
- [x] Docker Compose configurado (PostgreSQL:5433, Redis:6380)
- [x] Base de datos PostgreSQL conectada
- [x] Redis configurado
- [x] Variables de entorno (.env) configuradas
- [x] Seeding de base de datos ejecutado

### Entidades (8 totales)
- [x] Plant (plantas con configuración JSONB)
- [x] User (usuarios admin/operator/viewer)
- [x] Appointment (turnos con id serial para compatibilidad)
- [x] AppointmentDetail (datos del turno)
- [x] Payment (pagos)
- [x] InspectionLine (líneas de inspección)
- [x] Pricing (precios por planta y vehículo)
- [x] ErrorLog (log de errores)

### Módulos
- [x] Plants Module (con caché en memoria)
- [x] Auth Module (JWT + Passport local strategy)
- [x] Appointments Module (6 endpoints públicos)
- [x] Payments Module (estructura básica)
- [x] Admin Module (2 endpoints)

### Endpoints Implementados

#### Públicos (sin autenticación)
- `POST /api/auth/getQuotes` - Obtener turnos disponibles
- `POST /api/auth/confQuote` - Confirmar turno
- `POST /api/auth/getQuotesForResc` - Obtener turnos para reprogramar
- `POST /api/auth/getQuoteForCancel` - Obtener turno para cancelar
- `POST /api/auth/changeDate` - Cambiar fecha de turno
- `POST /api/auth/cancelQuote` - Cancelar turno

#### Autenticados (requieren JWT)
- `POST /api/auth/login` - Login admin
- `GET /api/auth/user` - Perfil usuario
- `GET /api/auth/logout` - Logout
- `GET /api/auth/turDiaAct` - Turnos del día actual
- `GET /api/auth/turDiaFut` - Turnos de días futuros

#### Webhooks
- `POST /api/auth/notif` - Webhook Yacare
- `POST /api/auth/notifMeli` - Webhook MercadoPago

#### Utilitarios
- `GET /api/plants` - Listar plantas activas

### Datos Iniciales Creados
#### 5 Plantas:
1. lasheras - Revitotal - Las Heras
2. maipu - Revitotal - Maipú
3. godoycruz - Godoy Cruz
4. rivadavia - Rivadavia
5. sanmartin - San Martín - Mendoza

#### Precios (20 registros):
- 4 tipos de vehículo × 5 plantas
- AUTO PARTICULAR: $8500
- MOTO HASTA 300 CC: $4000
- MOTO MAS DE 300 CC: $4500
- CAMIONETA PARTICULAR: $9000

#### 5 Usuarios Admin:
- admin@lasheras.com / admin123
- admin@maipu.com / admin123
- admin@godoycruz.com / admin123
- admin@rivadavia.com / admin123
- admin@sanmartin.com / admin123

### Características Técnicas
- Multi-tenancy por subdomain/header/path
- Middleware PlantResolver (inyecta contexto de planta)
- Decorador @CurrentPlant() en controllers
- Validación de DTOs con class-validator
- Rate limiting (ThrottlerModule)
- CORS configurado
- Logging personalizado

## ⚠️ Pendiente de Implementación

### Alta Prioridad
- [ ] **Script de generación de turnos disponibles**
  - Crear appointments con status 'D' (disponible)
  - Configurar horarios por planta
  - Definir cantidad de líneas por franja horaria
  
- [ ] **Integración real con Yacare**
  - Implementar createPaymentOrder()
  - Procesar webhook de notificación
  - Actualizar payment status
  
- [ ] **Integración real con MercadoPago**
  - Implementar createPaymentOrder()
  - Procesar webhook de notificación
  - Manejo de excluded payment methods

### Media Prioridad
- [ ] **Servicio de Email**
  - Confirmación de turno
  - Reprogramación
  - Cancelación
  - Templates HTML con Nodemailer

- [ ] **Endpoints Admin Restantes**
  - `POST /api/auth/creTur` - Crear turno manual
  - `POST /api/auth/regPag` - Registrar pago
  - `POST /api/auth/repTur` - Reprogramar turno

- [ ] **Integración con RTO**
  - Confirmación de turnos en sistema RTO
  - Sincronización de datos de inspección

### Baja Prioridad
- [ ] **Cache Service con Redis**
  - Caché distribuido para plantas
  - Caché de precios
  - Session storage

- [ ] **Tests E2E**
  - Tests de endpoints públicos
  - Tests de autenticación
  - Tests de webhooks

- [ ] **Migrations**
  - Generar migrations de TypeORM
  - Script de migración para producción

## 🚀 Cómo Ejecutar

```bash
# 1. Instalar dependencias (ya hecho)
npm install

# 2. Levantar contenedores (ya hecho)
docker compose up -d

# 3. Ejecutar seeding (ya hecho)
npm run seed

# 4. Iniciar servidor en desarrollo
npm run start:dev
```

## 🔍 Cómo Probar

### Obtener turnos disponibles:
```bash
curl -X POST http://localhost:3000/api/auth/getQuotes \
  -H "Content-Type: application/json" \
  -H "X-Plant-Code: lasheras" \
  -d '{
    "dia":"2026-01-15",
    "vehiculo":"AUTO PARTICULAR",
    "apellido":"Perez"
  }'
```

### Login admin:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Plant-Code: lasheras" \
  -d '{
    "email":"admin@lasheras.com",
    "password":"admin123"
  }'
```

### Listar plantas:
```bash
curl http://localhost:3000/api/plants
```

## 📊 Base de Datos

**Host:** localhost:5433  
**Database:** reviturnos  
**User:** reviturnos  
**Password:** reviturnos_password_2026

Conectar con:
```bash
psql -h localhost -p 5433 -U reviturnos -d reviturnos
```

## 🔑 Redis

**Host:** localhost:6380  
**DB:** 0

Conectar con:
```bash
redis-cli -p 6380
```

## 📝 Notas

- El frontend Next.js no necesita cambios - API compatible 100%
- Arquitectura multi-tenant lista para escalar a más plantas
- Configuración dinámica por planta en JSONB
- Row-Level Security pendiente de implementar en PostgreSQL
- Payment providers necesitan credenciales reales en config de plantas

---
**Última actualización:** 10 de enero de 2026
**Servidor corriendo en:** http://localhost:3000/api
