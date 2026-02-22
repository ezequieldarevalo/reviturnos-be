import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentPlant } from '@/common/decorators/current-plant.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Plant } from '@/database/entities/plant.entity';
import { User } from '@/database/entities/user.entity';
import {
  CreateAppointmentDto,
  RegisterPaymentDto,
  RescheduleAppointmentDto,
  GetAppointmentDataDto,
  MarkAppointmentCompletedDto,
  UpdateMercadoPagoConfigDto,
} from './dto/admin.dto';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  // GET /api/auth/turDiaAct
  @Get('turDiaAct')
  async obtenerTurnosDiaActual(@CurrentPlant() plant: Plant) {
    return this.adminService.getTurnosDiaActual(plant);
  }

  // GET /api/auth/turDiaFut?dia=2025-01-15
  @Get('turDiaFut')
  async obtenerTurnosDiaFuturo(@CurrentPlant() plant: Plant, @Query('dia') dia: string) {
    return this.adminService.getTurnosDiaFuturo(plant, dia);
  }

  // GET /api/auth/tipVeh
  @Get('tipVeh')
  async obtenerTiposVehiculo(@CurrentPlant() plant: Plant) {
    return this.adminService.getVehicleTypes(plant);
  }

  // POST /api/auth/tur
  @Post('tur')
  async obtenerDatosTurno(@CurrentPlant() plant: Plant, @Body() dto: GetAppointmentDataDto) {
    return this.adminService.getAppointmentData(plant, dto.id_turno);
  }

  // POST /api/auth/creTur
  @Post('creTur')
  async crearTurno(@CurrentPlant() plant: Plant, @Body() dto: CreateAppointmentDto) {
    return this.adminService.createAppointment(plant, dto);
  }

  // POST /api/auth/regPag
  @Post('regPag')
  async registrarPago(@CurrentPlant() plant: Plant, @Body() dto: RegisterPaymentDto) {
    return this.adminService.registerPayment(plant, dto);
  }

  // POST /api/auth/repTur
  @Post('repTur')
  async reprogramarTurno(@CurrentPlant() plant: Plant, @Body() dto: RescheduleAppointmentDto) {
    return this.adminService.rescheduleAppointment(plant, dto);
  }

  // GET /api/auth/turId?id_turno=...
  @Get('turId')
  async buscarTurnoPorId(@CurrentPlant() plant: Plant, @Query('id_turno') idTurno: string) {
    return this.adminService.searchAppointmentById(plant, idTurno);
  }

  // GET /api/auth/turDom?dominio=...
  @Get('turDom')
  async buscarTurnoPorDominio(@CurrentPlant() plant: Plant, @Query('dominio') dominio: string) {
    return this.adminService.searchAppointmentByDomain(plant, dominio);
  }

  // GET /api/auth/obtTurRep
  @Get('obtTurRep')
  async obtenerTurnosParaReprog(@CurrentPlant() plant: Plant) {
    return this.adminService.getTurnosParaReprog(plant);
  }

  // POST /api/auth/regRealTur
  @Post('regRealTur')
  async registrarRealizacionTurno(
    @CurrentPlant() plant: Plant,
    @Body() dto: MarkAppointmentCompletedDto,
  ) {
    return this.adminService.markAppointmentCompleted(plant, dto.id_turno);
  }

  // GET /api/auth/admin/mp-config
  @Get('admin/mp-config')
  async getMercadoPagoConfig(@CurrentPlant() plant: Plant, @CurrentUser() user: User) {
    return this.adminService.getMercadoPagoConfig(plant, user);
  }

  // POST /api/auth/admin/mp-config
  @Post('admin/mp-config')
  async updateMercadoPagoConfig(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Body() dto: UpdateMercadoPagoConfigDto,
  ) {
    return this.adminService.updateMercadoPagoConfig(plant, user, dto);
  }
}
