import { Controller, Post, Body, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Public } from '@/common/decorators/public.decorator';

@Controller('auth')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  // POST /api/auth/notif (Webhook Yacare)
  @Public()
  @Post('notif')
  async yacareWebhook(@Body() payload: any) {
    return this.paymentsService.processYacareWebhook(payload);
  }

  // POST /api/auth/notifMeli (Webhook MercadoPago)
  @Public()
  @Post('notifMeli')
  async mercadoPagoWebhook(@Body() payload: any, @Query('plant') plantCode?: string) {
    return this.paymentsService.processMercadoPagoWebhook(payload, plantCode);
  }
}
