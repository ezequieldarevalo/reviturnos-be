# ReviTurnos Backend

Backend unificado multi-tenant para sistema de turnos de revisión técnica vehicular (RTO).

## 🚀 Stack Tecnológico

- **Framework**: NestJS 10
- **Runtime**: Node.js 20+
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **ORM**: TypeORM
- **Autenticación**: JWT + Passport
- **Lenguaje**: TypeScript

## 🏗️ Arquitectura

Sistema multi-tenant donde cada planta de RTO tiene sus propios datos aislados mediante `plant_id`. Todas las plantas comparten:
- Una única base de datos PostgreSQL
- Un único backend (esta aplicación)
- Configuración dinámica por planta (JSONB)

## 📋 Requisitos

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker & Docker Compose (para desarrollo local)
- PostgreSQL 15+ (en producción)
- Redis 7+ (en producción)

## 🛠️ Setup Desarrollo

### 1. Clonar e instalar dependencias

```bash
cd reviturnos-backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

### 3. Levantar servicios (PostgreSQL + Redis)

```bash
docker-compose up -d
```

### 4. Ejecutar migraciones

```bash
npm run migration:run
```

### 5. Cargar datos iniciales (seeds)

```bash
npm run seed
```

### 6. Iniciar en modo desarrollo

```bash
npm run start:dev
```

La API estará disponible en: `http://localhost:3000`

## 📡 Endpoints Principales

### Públicos (sin autenticación)

- `POST /api/auth/getQuotes` - Obtener turnos disponibles
- `POST /api/auth/confQuote` - Confirmar turno
- `POST /api/auth/getQuotesForResc` - Obtener turnos para reprogramar
- `POST /api/auth/getQuoteForCancel` - Obtener turno para cancelar
- `POST /api/auth/changeDate` - Cambiar fecha de turno
- `POST /api/auth/cancelQuote` - Cancelar turno
- `POST /api/auth/notif` - Webhook Yacare
- `POST /api/auth/notifMeli` - Webhook MercadoPago

### Autenticados (requieren Bearer token)

- `POST /api/auth/login` - Login admin
- `GET /api/auth/turDiaAct` - Turnos del día actual
- `GET /api/auth/turDiaFut` - Turnos de días futuros
- `POST /api/auth/creTur` - Crear turno (admin)
- `POST /api/auth/regPag` - Registrar pago (admin)

## 🔑 Identificación de Planta

El sistema detecta la planta en este orden:

1. **Subdomain**: `lasheras.api.reviturnos.com.ar` → `plant_code: lasheras`
2. **Header**: `X-Plant-Code: lasheras`
3. **Path**: `/api/lasheras/auth/getQuotes`

## 🧪 Testing

```bash
# Tests unitarios
npm run test

# Tests con coverage
npm run test:cov

# Tests E2E
npm run test:e2e
```

## 🗄️ Migraciones

```bash
# Generar nueva migración
npm run migration:generate -- src/database/migrations/NombreMigracion

# Ejecutar migraciones pendientes
npm run migration:run

# Revertir última migración
npm run migration:revert
```

## 🚢 Deploy

### Producción

```bash
# Build
npm run build

# Ejecutar migraciones en prod
NODE_ENV=production npm run migration:run

# Iniciar
npm run start:prod
```

### Docker

```bash
# Build imagen
docker build -t reviturnos-backend .

# Run container
docker run -p 3000:3000 --env-file .env reviturnos-backend
```

## 📊 Estructura del Proyecto

```
src/
├── main.ts                    # Entry point
├── app.module.ts              # Root module
├── config/                    # Configuración
├── common/                    # Utilidades compartidas
├── database/                  # Entities, migrations, seeds
└── modules/
    ├── auth/                  # Autenticación
    ├── plants/                # Gestión de plantas
    ├── appointments/          # Turnos (core)
    ├── payments/              # Pagos
    ├── notifications/         # Emails
    └── admin/                 # Panel admin
```

## 🔐 Seguridad

- JWT tokens con expiración
- Rate limiting por planta
- Row Level Security en PostgreSQL
- Validación de inputs (class-validator)
- Passwords hasheados (bcrypt)

## 📝 Licencia

Propietario - ReviTurnos © 2026

## 👥 Equipo

Desarrollado por el equipo de ReviTurnos
