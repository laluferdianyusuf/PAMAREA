import { Module } from '@nestjs/common';

import { DashboardController } from './dashboard.controller.js';
import { DashboardRepository } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';

import { AuditLogModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PatrolRoundService } from '../schedule/services/patrol.round.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule],

  controllers: [DashboardController],

  providers: [DashboardService, DashboardRepository, PatrolRoundService],

  exports: [DashboardService],
})
export class DashboardModule {}
