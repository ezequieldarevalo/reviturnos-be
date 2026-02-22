// Appointment Status
export enum AppointmentStatus {
  AVAILABLE = 'D', // Disponible
  RESERVED = 'R', // Reservado
  CONFIRMED = 'C', // Confirmado
  PAID = 'P', // Pagado
  COMPLETED = 'T', // Terminado
  CANCELLED = 'X', // Cancelado
}

// Appointment Origin
export enum AppointmentOrigin {
  WEB = 'T', // Turnos (Web)
  ADMIN = 'A', // Admin
}

// Payment Status
export enum PaymentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REFUNDED = 'refunded',
}

// Payment Methods
export enum PaymentMethod {
  YACARE = 'yacare',
  MERCADOPAGO = 'mercadopago',
  CASH = 'efectivo',
  TRANSFER = 'transferencia',
}

// Vehicle Types
export const VEHICLE_TYPES = {
  AUTO: 'AUTO PARTICULAR',
  MOTO_CHICA: 'MOTO HASTA 300 CC',
  MOTO_GRANDE: 'MOTO MAS DE 300 CC',
  CAMIONETA: 'CAMIONETA PARTICULAR',
};

// Fuel Types
export const FUEL_TYPES = ['NAFTA', 'DIESEL', 'GAS'];

// User Roles
export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
}

// Error Reasons
export const ERROR_REASONS = {
  NO_AVAILABLE_QUOTES: 'NO_AVAILABLE_QUOTES',
  INVALID_VEHICLE_TYPE: 'INVALID_VEHICLE_TYPE',
  INEXISTENT_QUOTE: 'INEXISTENT_QUOTE',
  RECENTLY_RESERVED_QUOTE: 'RECENTLY_RESERVED_QUOTE',
  DOMAIN_WITH_PENDING_QUOTE: 'DOMAIN_WITH_PENDING_QUOTE',
  MELI_ERROR: 'MELI_ERROR',
  PLANT_NOT_FOUND: 'PLANT_NOT_FOUND',
  PLANT_INACTIVE: 'PLANT_INACTIVE',
  PLANT_CODE_REQUIRED: 'PLANT_CODE_REQUIRED',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL_ERROR_SERVER: 'INTERNAL_ERROR_SERVER',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};
