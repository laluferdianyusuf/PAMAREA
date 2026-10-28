import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogController } from './audit.controller.js';
import { AuditLogService } from './audit.service.js';

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService, PrismaService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
