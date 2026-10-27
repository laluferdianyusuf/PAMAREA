import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';

function initializeFirebase() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (credentialsPath) {
    initializeApp({
      credential: applicationDefault(),
    });

    console.log('Firebase initialized using application default credentials.');
    return;
  }

  const localCredentialsPath = resolve(process.cwd(), 'firebase-key.json');

  const serviceAccount = JSON.parse(readFileSync(localCredentialsPath, 'utf8'));

  initializeApp({
    credential: cert(serviceAccount),
  });

  console.log('Firebase initialized using local credentials.');
}

async function bootstrap() {
  initializeFirebase();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

  const uploadDirectory = resolve(process.cwd(), 'uploads');

  app.useStaticAssets(uploadDirectory, {
    prefix: '/uploads/',
  });

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
