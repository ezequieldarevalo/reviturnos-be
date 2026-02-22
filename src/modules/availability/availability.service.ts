import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { Plant, DaySchedule } from '../../database/entities/plant.entity';
import { InspectionLine } from '../../database/entities/inspection-line.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { TimeSlot, AvailabilityResponse } from './dto/time-slot.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Plant)
    private plantRepo: Repository<Plant>,
    @InjectRepository(InspectionLine)
    private lineRepo: Repository<InspectionLine>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
  ) {}

  /**
   * Genera slots disponibles dinámicamente basado en configuración
   */
  async getAvailableSlots(
    plantId: string,
    vehicleType: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<AvailabilityResponse> {
    // 1. Obtener configuración de la planta
    const plant = await this.plantRepo.findOne({ where: { id: plantId } });
    if (!plant) {
      throw new Error('Plant not found');
    }

    // 2. Obtener líneas para el tipo de vehículo
    const lines = await this.getInspectionLines(plantId, vehicleType, plant);

    if (lines.length === 0) {
      return { dates: [], slots: [] };
    }

    // 3. Generar slots teóricos basados en horarios
    const theoreticalSlots = this.generateTimeSlots(fromDate, toDate, plant, lines);

    // 4. Obtener turnos ocupados
    const occupiedSlots = await this.getOccupiedSlots(
      plantId,
      lines.map((l) => l.id),
      fromDate,
      toDate,
    );

    // 5. Marcar slots ocupados
    const availableSlots = this.markOccupiedSlots(theoreticalSlots, occupiedSlots);

    // 6. Extraer fechas únicas
    const uniqueDates = [...new Set(availableSlots.map((slot) => slot.date))].sort();

    return {
      dates: uniqueDates,
      slots: availableSlots,
    };
  }

  /**
   * Obtiene líneas de inspección según tipo de vehículo y configuración
   */
  private async getInspectionLines(
    plantId: string,
    vehicleType: string,
    plant: Plant,
  ): Promise<InspectionLine[]> {
    const ignoreVehicleLines = plant.config?.business?.ignoreVehicleLines || false;

    if (ignoreVehicleLines) {
      // Retorna todas las líneas activas
      return this.lineRepo.find({
        where: { plantId, active: true },
      });
    } else {
      // Filtra por tipo de vehículo
      return this.lineRepo.find({
        where: { plantId, vehicleType, active: true },
      });
    }
  }

  /**
   * Genera todos los slots teóricos basados en horarios configurados
   */
  private generateTimeSlots(
    fromDate: Date,
    toDate: Date,
    plant: Plant,
    lines: InspectionLine[],
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const config = plant.config || {};
    const schedules = config.schedules || {};
    const holidays = config.holidays || [];
    const nonWorkingDays = config.nonWorkingDays || [];
    const specialDays = config.specialDays || {};

    const currentDate = new Date(fromDate);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= toDate) {
      const dateStr = this.formatDate(currentDate);
      const dayOfWeek = currentDate.getDay(); // 0=domingo, 6=sábado

      // Verificar si es feriado
      if (holidays.includes(dateStr)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Verificar si es día no laboral
      if (nonWorkingDays.includes(dayOfWeek)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Obtener horario del día (especial o regular)
      const schedule = this.getDaySchedule(dateStr, dayOfWeek, specialDays, schedules);

      if (schedule) {
        // Generar slots para cada línea
        for (const line of lines) {
          const lineSlots = this.generateSlotsForDay(dateStr, schedule, line);
          slots.push(...lineSlots);
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots;
  }

  /**
   * Obtiene el horario para un día específico
   */
  private getDaySchedule(
    dateStr: string,
    dayOfWeek: number,
    specialDays: { [date: string]: DaySchedule },
    schedules: any,
  ): DaySchedule | null {
    // Primero verificar días especiales
    if (specialDays[dateStr]) {
      return specialDays[dateStr];
    }

    // Luego horario regular
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];

    return schedules[dayName] || null;
  }

  /**
   * Genera slots para un día y una línea específica
   */
  private generateSlotsForDay(
    date: string,
    schedule: DaySchedule,
    line: InspectionLine,
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const from = this.normalizeScheduleTime(schedule.from);
    const to = this.normalizeScheduleTime(schedule.to);
    const slotsPerHour = Number(schedule.slotsPerHour) || 4;

    const [fromHour, fromMin] = from.split(':').map(Number);
    const [toHour, toMin] = to.split(':').map(Number);

    const minutesInterval = 60 / slotsPerHour; // 4 slots/hr = 15 min

    let currentHour = fromHour;
    let currentMin = fromMin;

    while (currentHour < toHour || (currentHour === toHour && currentMin < toMin)) {
      const time = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

      slots.push({
        date,
        time,
        lineId: line.id,
        lineName: line.name,
        available: true, // Por defecto disponible
      });

      // Avanzar al siguiente slot
      currentMin += minutesInterval;
      if (currentMin >= 60) {
        currentMin -= 60;
        currentHour += 1;
      }
    }

    return slots;
  }

  /**
   * Normaliza horarios configurados para tolerar formatos legacy migrados.
   * Ejemplos admitidos:
   * - "08:00" / "08:00:00" -> "08:00"
   * - "8" -> "08:00"
   * - "800" -> "08:00"
   * - "1530" -> "15:30"
   * - "00:08" (bug de migración) -> "08:00"
   */
  private normalizeScheduleTime(rawValue: unknown): string {
    const raw = String(rawValue ?? '').trim();
    if (!raw) return '00:00';

    const hhmmss = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (hhmmss) {
      const hours = Number(hhmmss[1]);
      const minutes = Number(hhmmss[2]);

      // Caso legacy detectado en migración: "00:08" quería decir "08:00"
      if (hours === 0 && minutes > 0 && minutes <= 23) {
        return `${String(minutes).padStart(2, '0')}:00`;
      }

      return `${String(Math.max(0, Math.min(23, hours))).padStart(2, '0')}:${String(
        Math.max(0, Math.min(59, minutes)),
      ).padStart(2, '0')}`;
    }

    const digits = raw.replace(/\D/g, '');
    if (!digits) return '00:00';

    // "8" => 08:00, "17" => 17:00
    if (digits.length <= 2) {
      const hours = Math.max(0, Math.min(23, Number(digits)));
      return `${String(hours).padStart(2, '0')}:00`;
    }

    // "800" => 08:00, "930" => 09:30, "1530" => 15:30
    const padded = digits.padStart(4, '0').slice(-4);
    const hours = Math.max(0, Math.min(23, Number(padded.slice(0, 2))));
    const minutes = Math.max(0, Math.min(59, Number(padded.slice(2, 4))));
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  /**
   * Obtiene turnos ocupados en el rango de fechas
   */
  private async getOccupiedSlots(
    plantId: string,
    lineIds: string[],
    fromDate: Date,
    toDate: Date,
  ): Promise<Appointment[]> {
    return this.appointmentRepo.find({
      where: {
        plantId,
        lineId: In(lineIds),
        appointmentDate: Between(this.formatDate(fromDate), this.formatDate(toDate)),
        status: In(['R', 'C', 'P', 'T']), // RESERVED, CONFIRMED, PAID, COMPLETED
      },
    });
  }

  /**
   * Marca los slots que están ocupados
   */
  private markOccupiedSlots(
    theoreticalSlots: TimeSlot[],
    occupiedSlots: Appointment[],
  ): TimeSlot[] {
    const occupiedMap = new Map<string, boolean>();

    // Crear mapa de slots ocupados
    for (const appointment of occupiedSlots) {
      // Normalizar hora: "10:30:00" → "10:30"
      const normalizedTime = appointment.appointmentTime.substring(0, 5);
      const key = `${appointment.appointmentDate}_${normalizedTime}_${appointment.lineId}`;
      occupiedMap.set(key, true);
    }

    // Marcar slots ocupados
    return theoreticalSlots.map((slot) => {
      const key = `${slot.date}_${slot.time}_${slot.lineId}`;
      return {
        ...slot,
        available: !occupiedMap.has(key),
      };
    });
  }

  /**
   * Formatea fecha a string YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
