import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [UsersController],
  providers: [UsersService, StorageService],
  exports: [UsersService],
})
export class UsersModule {}
