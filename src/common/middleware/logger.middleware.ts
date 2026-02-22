import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      const plant = req['plant']?.code || 'N/A';

      console.log(
        `[${new Date().toISOString()}] ${method} ${originalUrl} ${statusCode} ${duration}ms | Plant: ${plant}`,
      );
    });

    next();
  }
}
