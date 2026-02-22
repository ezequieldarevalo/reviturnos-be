import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('APP_PORT', 3000);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors({
    origin: corsOrigin.split(','),
    credentials: true,
  });

  // Global prefix (todas las rutas empiezan con /api)
  app.setGlobalPrefix('api');

  await app.listen(port);

  console.log(`🚀 ReviTurnos Backend running on: http://localhost:${port}/api`);
  console.log(`📚 Environment: ${configService.get('NODE_ENV')}`);
}

bootstrap();
