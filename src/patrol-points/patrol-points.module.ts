import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';

import { PatrolPointsController } from './patrol-points.controller.js';
import { PatrolPointsService } from './patrol-points.service.js';

@Module({
  imports: [PrismaModule],

  controllers: [PatrolPointsController],

  providers: [PatrolPointsService],

  exports: [PatrolPointsService],
})
export class PatrolPointsModule {}
