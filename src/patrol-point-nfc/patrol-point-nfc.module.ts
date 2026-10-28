import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';

import { AuditLogModule } from '../audit/audit.module.js';
import { PatrolPointNfcController } from './patrol-point-nfc.controller.js';
import { PatrolPointNfcService } from './patrol-point-nfc.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule],

  controllers: [PatrolPointNfcController],

  providers: [PatrolPointNfcService],

  exports: [PatrolPointNfcService],
})
export class PatrolPointNfcModule {}
