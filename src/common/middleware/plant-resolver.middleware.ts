import { Injectable, NestMiddleware, NotFoundException, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PlantsService } from '@/modules/plants/plants.service';
import { ERROR_REASONS } from '@/common/constants';

@Injectable()
export class PlantResolverMiddleware implements NestMiddleware {
  constructor(private plantsService: PlantsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const skipPlantResolutionPaths = [
      '/health',
      '/metrics',
      '/auth/login',
      '/api/auth/login',
      '/auth/onboarding',
      '/api/auth/onboarding',
      '/auth/super',
      '/api/auth/super',
      '/auth/notif',
      '/api/auth/notif',
      '/auth/notifMeli',
      '/api/auth/notifMeli',
    ];
    const skipPlantResolutionPattern =
      /(^|\/)auth\/(login|onboarding|super|notif|notifMeli)(\/|$|\?)/;
    const requestLocation = `${req.path || ''} ${req.originalUrl || ''} ${req.url || ''}`;

    // Skip plant resolution for health check and other non-plant routes
    if (
      skipPlantResolutionPaths.some((path) => requestLocation.includes(path)) ||
      skipPlantResolutionPattern.test(requestLocation)
    ) {
      return next();
    }

    // 1. Detectar planta por subdomain (solo hostnames válidos, no IP)
    const host = req.hostname;
    const hostParts = host.split('.');
    const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    const isIPv6 = host.includes(':');
    const isLocalHost = host === 'localhost';
    const hasSubdomain = hostParts.length >= 3;
    const subdomain = hasSubdomain ? hostParts[0] : null;
    const subdomainPlant =
      !isIPv4 && !isIPv6 && !isLocalHost && subdomain && subdomain !== 'api' ? subdomain : null;

    // 2. Fallback: Header X-Plant-Code
    const plantCodeHeader = req.headers['x-plant-code'] as string;

    // 3. Fallback: Path /lasheras/api/... or /api/lasheras/...
    const pathMatch = req.path.match(/\/(?:api\/)?([a-z]+)\//);

    const plantCode = plantCodeHeader || subdomainPlant || (pathMatch && pathMatch[1]);

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
      if (
        skipPlantResolutionPaths.some((path) => requestLocation.includes(path)) ||
        skipPlantResolutionPattern.test(requestLocation)
      ) {
        return next();
      }
      throw error;
    }
  }
}
