import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CurrentPlant } from '@/common/decorators/current-plant.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Plant } from '@/database/entities/plant.entity';
import {
  GetQuotesDto,
  ConfirmQuoteDto,
  GetQuotesForRescDto,
  ChangeDateDto,
  CancelQuoteDto,
} from './dto';

@Controller('auth')
export class AppointmentsController {
  constructor(private appointmentsService: AppointmentsService) {}

  // GET /api/auth/getQuotes
  @Public()
  @Get('getQuotes')
  async getQuotes(@CurrentPlant() plant: Plant, @Query() dto: GetQuotesDto) {
    return this.appointmentsService.getAvailableQuotes(plant, dto.tipoVehiculo);
  }

  // POST /api/auth/confQuote
  @Public()
  @Post('confQuote')
  async confirmQuote(@CurrentPlant() plant: Plant, @Body() dto: ConfirmQuoteDto) {
    return this.appointmentsService.confirmQuote(plant, dto);
  }

  // POST /api/auth/getQuotesForResc
  @Public()
  @Post('getQuotesForResc')
  async getQuotesForReschedule(@CurrentPlant() plant: Plant, @Body() dto: GetQuotesForRescDto) {
    return this.appointmentsService.getQuotesForReschedule(plant, dto.id_turno);
  }

  // POST /api/auth/getQuoteForCancel
  @Public()
  @Post('getQuoteForCancel')
  async getQuoteForCancel(@CurrentPlant() plant: Plant, @Body() dto: { id_turno: string }) {
    return this.appointmentsService.getQuoteForCancel(plant, dto.id_turno);
  }

  // POST /api/auth/changeDate
  @Public()
  @Post('changeDate')
  async changeDate(@CurrentPlant() plant: Plant, @Body() dto: ChangeDateDto) {
    return this.appointmentsService.changeDate(plant, dto);
  }

  // POST /api/auth/cancelQuote
  @Public()
  @Post('cancelQuote')
  async cancelQuote(@CurrentPlant() plant: Plant, @Body() dto: CancelQuoteDto) {
    return this.appointmentsService.cancelQuote(plant, dto);
  }
}
