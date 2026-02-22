import { Injectable, NestMiddleware, NotFoundException, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PlantsService } from '@/modules/plants/plants.service';
import { ERROR_REASONS } from '@/common/constants';

@Injectable()
export class PlantResolverMiddleware implements NestMiddleware {
  constructor(private plantsService: PlantsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Skip plant resolution for health check and other non-plant routes
    if (req.path.includes('/health') || req.path.includes('/metrics')) {
      return next();
    }

    // 1. Detectar planta por subdomain
    const host = req.hostname;
    const subdomain = host.split('.')[0];

    // 2. Fallback: Header X-Plant-Code
    const plantCodeHeader = req.headers['x-plant-code'] as string;

    // 3. Fallback: Path /lasheras/api/... or /api/lasheras/...
    const pathMatch = req.path.match(/\/(?:api\/)?([a-z]+)\//);

    const plantCode =
      (subdomain !== 'localhost' && subdomain !== 'api' ? subdomain : null) ||
      plantCodeHeader ||
      (pathMatch && pathMatch[1]);

    if (!plantCode) {
      throw new BadRequestException({
        reason: ERROR_REASONS.PLANT_CODE_REQUIRED,
        message: 'Plant code not found in subdomain, header, or path',
      });
    }

    // 4. Obtener planta de DB (con cache)
    try {
      const plant = await this.plantsService.findByCode(plantCode);

      if (!plant) {
        throw new NotFoundException({
          reason: ERROR_REASONS.PLANT_NOT_FOUND,
          message: `Plant '${plantCode}' not found`,
        });
      }

      if (!plant.active) {
        throw new NotFoundException({
          reason: ERROR_REASONS.PLANT_INACTIVE,
          message: `Plant '${plantCode}' is not active`,
        });
      }

      // 5. Inyectar en request
      req['plant'] = plant;

      next();
    } catch (error) {
      // Si el servicio de plantas aún no está disponible, continuar sin planta
      // Esto permite que las rutas de auth funcionen
      if (req.path.includes('/auth/login')) {
        return next();
      }
      throw error;
    }
  }
}
