import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { cert, initializeApp } from 'firebase-admin/app';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';

const require = createRequire(import.meta.url);

async function bootstrap() {
  const serviceAccount = require('../firebase-key.json');

  initializeApp({
    credential: cert(serviceAccount),
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

  const uploadDirectory = resolve(process.cwd(), 'uploads');

  app.useStaticAssets(uploadDirectory, {
    prefix: '/uploads/',
  });

  console.log('Upload directory:', uploadDirectory);

  // CORS
  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>('PORT') ?? 2026;

  await app.listen(port, '0.0.0.0');

  console.log(`Server running on http://localhost:${port}`);
  console.log(`Static uploads: http://localhost:${port}/uploads/`);
}

bootstrap();
