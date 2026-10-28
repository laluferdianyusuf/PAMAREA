import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';

import { AuditLogModule } from '../audit/audit.module.js';
import { NfcController } from './nfc.controller.js';
import { NfcService } from './nfc.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule],

  controllers: [NfcController],

  providers: [NfcService],

  exports: [NfcService],
})
export class NfcModule {}
