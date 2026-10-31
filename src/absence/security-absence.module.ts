import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SecurityAbsenceController } from './security-absence.controller.js';
import { SecurityAbsenceService } from './security-absence.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule],

  controllers: [SecurityAbsenceController],

  providers: [SecurityAbsenceService],

  exports: [SecurityAbsenceService],
})
export class SecurityAbsenceModule {}
