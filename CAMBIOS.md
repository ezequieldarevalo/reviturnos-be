# Resumen de Cambios - ReviTurnos Backend

## ✅ Cambios Completados

### 1. Eliminación de Yacare ✓
- ❌ Removida constante `PaymentProvider.YACARE`
- ❌ Removido error `YACARE_ERROR`
- ❌ Eliminados campos `yacareToken`, `yacareNotifUrl`, `yacareRedirectUrl` de la entidad Plant
- ❌ Removida configuración `yacare: { enabled }` de PlantConfig
- ❌ Eliminado endpoint `POST /api/auth/notif` (webhook Yacare)
- ❌ Removido método `processYacareWebhook()` del PaymentsService
- ✅ Actualizado seeds para solo incluir MercadoPago en integrations

**Resultado:** Solo queda MercadoPago como plataforma de pago externa.

---

### 2. Servicio de Emails ✓
**Archivos creados:**
- `src/modules/email/email.module.ts`
- `src/modules/email/email.service.ts`

**Características:**
- ✅ Integración con Nodemailer
- ✅ Configuración SMTP por planta (desde DB)
- ✅ 3 tipos de emails con templates HTML:
  - **Confirmación de turno** (con botón de pago si aplica)
  - **Cancelación de turno**
  - **Reprogramación de turno**
- ✅ Templates responsive con estilos inline
- ✅ Logging de envíos y errores
- ✅ Fallback gracioso si SMTP no está configurado

**Integración:**
- Módulo importado en AppModule, AppointmentsModule y AdminModule
- Emails se envían automáticamente en:
  * `confirmQuote()` - Al confirmar turno
  * `changeDate()` - Al reprogramar turno
  * `cancelQuote()` - Al cancelar turno
  * `createAppointment()` - Al crear turno manual (admin)
  * `rescheduleAppointment()` - Al reprogramar desde admin

---

### 3. Endpoints Admin Completados ✓

#### **POST /api/auth/creTur** (Crear turno manual)
- ✅ Busca turno disponible en fecha/hora/línea especificada
- ✅ Valida precio del tipo de vehículo
- ✅ Marca turno como CONFIRMED con origen ADMIN
- ✅ Crea AppointmentDetail con todos los datos
- ✅ Envía email de confirmación
- **DTO:** `CreateAppointmentDto` (fecha, hora, dominio, nombre, apellido, email, teléfono, tipo_vehiculo, combustible, linea)

#### **POST /api/auth/regPag** (Registrar pago)
- ✅ Busca turno existente
- ✅ Crea registro de pago en tabla payments
- ✅ Actualiza estado del turno a PAID
- ✅ Soporta métodos: efectivo, mercadopago, transferencia
- **DTO:** `RegisterPaymentDto` (turno_id, metodo, referencia, transaction_id)

#### **POST /api/auth/repTur** (Reprogramar turno)
- ✅ Valida turno actual existe
- ✅ Busca nuevo turno disponible
- ✅ Libera turno anterior (status → AVAILABLE)
- ✅ Reserva nuevo turno
- ✅ Mueve AppointmentDetail y Payments al nuevo turno
- ✅ Envía email de reprogramación
- **DTO:** `RescheduleAppointmentDto` (turno_id, nueva_fecha, nueva_hora, nueva_linea)

**Archivos modificados:**
- `src/modules/admin/dto/admin.dto.ts` (creado)
- `src/modules/admin/admin.module.ts` (agregado Pricing y EmailModule)
- `src/modules/admin/admin.service.ts` (3 nuevos métodos)
- `src/modules/admin/admin.controller.ts` (3 nuevos endpoints)

---

### 4. Correcciones de Entidades ✓
- ✅ Agregado campo `price: number` a AppointmentDetail
- ✅ Todos los nombres de propiedades en camelCase
- ✅ lineId corregido a tipo `string | null`

---

## 📊 Estado del Backend

### Endpoints Totales: 15

#### Públicos (6)
- POST /api/auth/getQuotes
- POST /api/auth/confQuote ✉️
- POST /api/auth/getQuotesForResc
- POST /api/auth/getQuoteForCancel
- POST /api/auth/changeDate ✉️
- POST /api/auth/cancelQuote ✉️

#### Autenticados (8)
- POST /api/auth/login
- GET /api/auth/user
- GET /api/auth/logout
- GET /api/auth/turDiaAct
- GET /api/auth/turDiaFut
- POST /api/auth/creTur ✉️ ✨
- POST /api/auth/regPag ✨
- POST /api/auth/repTur ✉️ ✨

#### Webhooks (1)
- POST /api/auth/notifMeli (MercadoPago)

#### Utilitarios (1)
- GET /api/plants

**Leyenda:** ✉️ = Envía email | ✨ = Nuevo endpoint

---

## 🔧 Configuración Requerida por Planta

Para que los emails funcionen, cada planta debe tener configurado en la base de datos:

```typescript
{
  emailFrom: 'turnos@planta.com',
  emailFromName: 'Nombre de la Planta',
  smtpHost: 'smtp.hostinger.com.ar',
  smtpPort: 587,
  smtpUser: 'turnos@planta.com',
  smtpPassword: 'contraseña',
  smtpEncryption: 'tls'
}
```

Estas columnas ya existen en la tabla `plants`.

---

## 🚀 Cómo Probar

### 1. Crear Turno Manual (Admin)
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Plant-Code: lasheras" \
  -d '{
    "email":"admin@lasheras.com",
    "password":"admin123"
  }'

# Crear turno (requiere JWT del login)
curl -X POST http://localhost:3000/api/auth/creTur \
  -H "Content-Type: application/json" \
  -H "X-Plant-Code: lasheras" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "fecha":"2026-01-20",
    "hora":"10:00",
    "dominio":"ABC123",
    "nombre":"Juan",
    "apellido":"Perez",
    "email":"juan@example.com",
    "telefono":"2612345678",
    "tipo_vehiculo":"AUTO PARTICULAR",
    "combustible":"NAFTA"
  }'
```

### 2. Registrar Pago
```bash
curl -X POST http://localhost:3000/api/auth/regPag \
  -H "Content-Type: application/json" \
  -H "X-Plant-Code: lasheras" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "turno_id":123,
    "metodo":"efectivo",
    "referencia":"PAGO-001"
  }'
```

### 3. Reprogramar Turno
```bash
curl -X POST http://localhost:3000/api/auth/repTur \
  -H "Content-Type: application/json" \
  -H "X-Plant-Code: lasheras" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "turno_id":123,
    "nueva_fecha":"2026-01-25",
    "nueva_hora":"14:00"
  }'
```

---

## 📝 Notas Importantes

### Emails
- Los emails se envían de forma **asíncrona** (no bloquean la respuesta HTTP)
- Si el SMTP no está configurado, se loguea un warning pero no falla el request
- Los templates son **responsive** y se ven bien en mobile
- Incluyen toda la información del turno (fecha, hora, dominio, tipo vehículo)

### Validaciones
- **creTur:** Requiere que exista un turno AVAILABLE en la fecha/hora exacta
- **regPag:** Valida que el turno exista y pertenezca a la planta
- **repTur:** Valida que ambos turnos (actual y nuevo) existan y nuevo esté disponible

### Multi-tenancy
- Todos los endpoints admin filtran por `plant.id` automáticamente
- No es posible crear/modificar turnos de otras plantas
- El middleware `PlantResolverMiddleware` inyecta la planta desde subdomain/header/path

---

## 🐛 Issues Conocidos
- ⚠️ **Falta script de generación de turnos disponibles** - Los endpoints buscan turnos `status='D'` pero no hay forma de crearlos aún
- ⚠️ **MercadoPago no implementado** - El webhook existe pero está vacío (mock)
- ℹ️ **TypeScript warnings en compilación** - Hay algunos warnings sobre tipos pero no afectan ejecución

---

## 📦 Dependencias Agregadas
```json
{
  "dependencies": {
    "nodemailer": "^6.9.9"
  },
  "devDependencies": {
    "@types/nodemailer": "^6.4.14"
  }
}
```

---

## ✨ Próximos Pasos Sugeridos

1. **Crear script para generar turnos disponibles**
   - Definir horarios por planta
   - Definir cantidad de líneas por franja horaria
   - Crear appointments con status 'D'

2. **Implementar integración real con MercadoPago**
   - Crear preference de pago
   - Procesar webhooks de notificación
   - Actualizar estados de pago

3. **Testing**
   - E2E tests para endpoints admin
   - Unit tests para email service
   - Integration tests para flujo completo de turnos

4. **Migración de datos**
   - Script para migrar turnos desde Laravel
   - Script para migrar usuarios admin
   - Validación de integridad de datos

---

**Última actualización:** 10 de enero de 2026, 19:00  
**Backend funcionando en:** http://localhost:3000/api ✅
