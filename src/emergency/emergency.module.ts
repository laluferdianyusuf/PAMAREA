import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EmergencyController } from './emergency.controller.js';
import { EmergencyService } from './emergency.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [EmergencyController],
  providers: [EmergencyService],
  exports: [EmergencyService],
})
export class EmergencyModule {}
