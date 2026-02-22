import { Controller, Get } from '@nestjs/common';
import { PlantsService } from './plants.service';
import { Public } from '@/common/decorators/public.decorator';

@Controller('plants')
export class PlantsController {
  constructor(private plantsService: PlantsService) {}

  @Public()
  @Get()
  async getAllPlants() {
    return this.plantsService.findAll();
  }
}
