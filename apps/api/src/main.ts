import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { validateEnvironment } from './common/environment';

async function bootstrap(): Promise<void> {
  validateEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.set('trust proxy', 1);
  const port = Number(process.env.PORT ?? 3001);
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim());

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.use(cookieParser());
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    next();
  });
  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
  Logger.log(`API disponible en http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
