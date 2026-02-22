import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  Param,
  Patch,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentPlant } from '@/common/decorators/current-plant.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Plant } from '@/database/entities/plant.entity';
import { User } from '@/database/entities/user.entity';
import { UserRole } from '@/common/constants';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateAppointmentDto,
  RegisterPaymentDto,
  RescheduleAppointmentDto,
  GetAppointmentDataDto,
  MarkAppointmentCompletedDto,
  UpdateMercadoPagoConfigDto,
  SuperAdminCreatePlantDto,
  SuperAdminUpdatePlantDto,
  SuperAdminCreateUserDto,
  SuperAdminUpdateUserDto,
  SuperAdminListUsersQueryDto,
  ListActionLogsDto,
} from './dto/admin.dto';

@Controller('auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  // GET /api/auth/turDiaAct
  @Get('turDiaAct')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async obtenerTurnosDiaActual(@CurrentPlant() plant: Plant, @CurrentUser() user: User) {
    return this.adminService.getTurnosDiaActual(plant, user);
  }

  // GET /api/auth/turDiaFut?dia=2025-01-15
  @Get('turDiaFut')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async obtenerTurnosDiaFuturo(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Query('dia') dia: string,
  ) {
    return this.adminService.getTurnosDiaFuturo(plant, user, dia);
  }

  // GET /api/auth/tipVeh
  @Get('tipVeh')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async obtenerTiposVehiculo(@CurrentPlant() plant: Plant, @CurrentUser() user: User) {
    return this.adminService.getVehicleTypes(plant, user);
  }

  // POST /api/auth/tur
  @Post('tur')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async obtenerDatosTurno(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Body() dto: GetAppointmentDataDto,
  ) {
    return this.adminService.getAppointmentData(plant, user, dto.id_turno);
  }

  // POST /api/auth/creTur
  @Post('creTur')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR)
  async crearTurno(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.adminService.createAppointment(plant, user, dto);
  }

  // POST /api/auth/regPag
  @Post('regPag')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR)
  async registrarPago(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Body() dto: RegisterPaymentDto,
  ) {
    return this.adminService.registerPayment(plant, user, dto);
  }

  // POST /api/auth/repTur
  @Post('repTur')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR)
  async reprogramarTurno(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.adminService.rescheduleAppointment(plant, user, dto);
  }

  // GET /api/auth/turId?id_turno=...
  @Get('turId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async buscarTurnoPorId(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Query('id_turno') idTurno: string,
  ) {
    return this.adminService.searchAppointmentById(plant, user, idTurno);
  }

  // GET /api/auth/turDom?dominio=...
  @Get('turDom')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async buscarTurnoPorDominio(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Query('dominio') dominio: string,
  ) {
    return this.adminService.searchAppointmentByDomain(plant, user, dominio);
  }

  // GET /api/auth/obtTurRep
  @Get('obtTurRep')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async obtenerTurnosParaReprog(@CurrentPlant() plant: Plant, @CurrentUser() user: User) {
    return this.adminService.getTurnosParaReprog(plant, user);
  }

  // POST /api/auth/regRealTur
  @Post('regRealTur')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR)
  async registrarRealizacionTurno(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Body() dto: MarkAppointmentCompletedDto,
  ) {
    return this.adminService.markAppointmentCompleted(plant, user, dto.id_turno);
  }

  // GET /api/auth/admin/mp-config
  @Get('admin/mp-config')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async getMercadoPagoConfig(@CurrentPlant() plant: Plant, @CurrentUser() user: User) {
    return this.adminService.getMercadoPagoConfig(plant, user);
  }

  // POST /api/auth/admin/mp-config
  @Post('admin/mp-config')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async updateMercadoPagoConfig(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Body() dto: UpdateMercadoPagoConfigDto,
  ) {
    return this.adminService.updateMercadoPagoConfig(plant, user, dto);
  }

  @Get('admin/action-logs')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getActionLogs(
    @CurrentPlant() plant: Plant,
    @CurrentUser() user: User,
    @Query() query: ListActionLogsDto,
  ) {
    return this.adminService.listActionLogsByPlant(plant, user, query);
  }

  @Get('super/plants')
  @Roles(UserRole.SUPERADMIN)
  async listPlants(@CurrentUser() user: User) {
    return this.adminService.listPlantsForSuperAdmin(user);
  }

  @Post('super/plants')
  @Roles(UserRole.SUPERADMIN)
  async createPlant(@CurrentUser() user: User, @Body() dto: SuperAdminCreatePlantDto) {
    return this.adminService.createPlantForSuperAdmin(user, dto);
  }

  @Patch('super/plants/:id')
  @Roles(UserRole.SUPERADMIN)
  async updatePlant(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuperAdminUpdatePlantDto,
  ) {
    return this.adminService.updatePlantForSuperAdmin(user, id, dto);
  }

  @Patch('super/plants/:id/deactivate')
  @Roles(UserRole.SUPERADMIN)
  async deactivatePlant(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deactivatePlantForSuperAdmin(user, id);
  }

  @Get('super/users')
  @Roles(UserRole.SUPERADMIN)
  async listUsers(@CurrentUser() user: User, @Query() query: SuperAdminListUsersQueryDto) {
    return this.adminService.listUsersForSuperAdmin(user, query.plantId);
  }

  @Post('super/users')
  @Roles(UserRole.SUPERADMIN)
  async createUser(@CurrentUser() user: User, @Body() dto: SuperAdminCreateUserDto) {
    return this.adminService.createUserForSuperAdmin(user, dto);
  }

  @Patch('super/users/:id')
  @Roles(UserRole.SUPERADMIN)
  async updateUser(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuperAdminUpdateUserDto,
  ) {
    return this.adminService.updateUserForSuperAdmin(user, id, dto);
  }

  @Get('super/action-logs')
  @Roles(UserRole.SUPERADMIN)
  async listActionLogsForSuperAdmin(@CurrentUser() user: User, @Query() query: ListActionLogsDto) {
    return this.adminService.listActionLogsForSuperAdmin(user, query);
  }
}
