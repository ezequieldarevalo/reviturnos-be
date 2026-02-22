export class TimeSlot {
  id?: number; // Solo si es un turno existente
  date: string; // "2026-01-15"
  time: string; // "14:30"
  lineId: string;
  lineName: string;
  available: boolean;
}

export class AvailabilityQuery {
  plantId: string;
  vehicleType: string;
  fromDate: Date;
  toDate: Date;
}

export class AvailabilityResponse {
  dates: string[]; // ["2026-01-15", "2026-01-16"]
  slots: TimeSlot[];
}
