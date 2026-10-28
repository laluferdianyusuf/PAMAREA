import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { ConfigModule } from '@nestjs/config';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

import { JwtStrategy } from './strategies/jwt.strategy.js';

import { AuditLogModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageService } from '../storage/storage.service.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PassportModule,
    JwtModule.register({}),
    AuditLogModule,
  ],

  controllers: [AuthController],

  providers: [AuthService, JwtStrategy, StorageService],

  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
