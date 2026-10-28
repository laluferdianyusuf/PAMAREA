import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit.module.js';
import { PatrolScheduleAssignmentRouteController } from './controllers/patrol-schedule-assignment-route.controller.js';
import { PatrolCheckpointController } from './controllers/patrol.checkpoint.controller.js';
import { PatrolRoundController } from './controllers/patrol.round.controller.js';
import { PatrolScheduleController } from './controllers/patrol.schedule.controller.js';
import { PatrolScheduleDateController } from './controllers/patrol.schedule.date.controller.js';
import { PatrolScheduleGenerationController } from './controllers/patrol.schedule.generation.controller.js';
import { PatrolSchedulePointController } from './controllers/patrol.schedule.point.controller.js';
import { PatrolScheduleAssignmentController } from './controllers/schedule.assignment.controller.js';
import { ShiftChangeController } from './controllers/shift.change.controller.js';
import { ScheduleCronService } from './cron/schedule.cron.service.js';
import { PatrolSchedulePolicy } from './policies/patrol.schedule.policy.service.js';
import { PatrolScheduleRepository } from './repositories/patrol-schedule.repository.js';
import { PatrolScheduleAssignmentRouteService } from './services/patrol-schedule-assignment-route.service.js';
import { PatrolCheckpointService } from './services/patrol.checkpoint.service.js';
import { PatrolRoundService } from './services/patrol.round.service.js';
import { PatrolScheduleAssignmentService } from './services/patrol.schedule.assignment.service.js';
import { PatrolScheduleDateService } from './services/patrol.schedule.date.service.js';
import { PatrolSchedulePointService } from './services/patrol.schedule.point.service.js';
import { PatrolScheduleService } from './services/patrol.schedule.service.js';
import { ScheduleGenerationService } from './services/schedule.generation.service.js';
import { ShiftChangeService } from './services/shift.change.service.js';

@Module({
  imports: [AuditLogModule],
  controllers: [
    PatrolScheduleController,
    PatrolSchedulePointController,
    PatrolScheduleDateController,
    PatrolScheduleAssignmentController,
    PatrolScheduleGenerationController,
    PatrolRoundController,
    PatrolCheckpointController,
    ShiftChangeController,
    PatrolScheduleAssignmentRouteController,
  ],

  providers: [
    PatrolScheduleRepository,

    PatrolSchedulePolicy,

    PatrolScheduleService,
    PatrolSchedulePointService,
    PatrolScheduleDateService,
    PatrolScheduleAssignmentService,
    ScheduleGenerationService,
    PatrolRoundService,
    PatrolCheckpointService,
    ScheduleCronService,
    ShiftChangeService,
    PatrolScheduleAssignmentRouteService,
  ],

  exports: [
    PatrolScheduleService,
    ScheduleGenerationService,
    PatrolRoundService,
    PatrolCheckpointService,
  ],
})
export class PatrolScheduleModule {}
