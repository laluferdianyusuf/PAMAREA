import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { FindingsController } from './findings.controller.js';
import { FindingsService } from './findings.service.js';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [FindingsController],
  providers: [FindingsService],
  exports: [FindingsService],
})
export class FindingsModule {}
