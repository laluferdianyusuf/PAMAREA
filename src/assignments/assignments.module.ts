import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PatrolAssignmentController } from './assignments.controller.js';
import { PatrolAssignmentService } from './assignments.service.js';

@Module({
  imports: [PrismaModule],

  controllers: [PatrolAssignmentController],

  providers: [PatrolAssignmentService],

  exports: [PatrolAssignmentService],
})
export class PatrolAssignmentModule {}
