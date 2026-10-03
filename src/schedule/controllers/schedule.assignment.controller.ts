import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { User } from '../../generated/prisma/client.js';
import { RoleName } from '../../generated/prisma/enums.js';
import { CreateScheduleAssignmentDto } from '../dto/create.schedule.assignment.dto.js';
import { PatrolScheduleAssignmentService } from '../services/patrol.schedule.assignment.service.js';

@Controller('patrol-schedules/:scheduleId/assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatrolScheduleAssignmentController {
  constructor(private readonly service: PatrolScheduleAssignmentService) {}

  @Post()
  @Roles(RoleName.ADMIN)
  create(
    @Param('scheduleId')
    scheduleId: string,
    @Body()
    dto: CreateScheduleAssignmentDto,
    @CurrentUser()
    user: User,
  ) {
    return this.service.create(scheduleId, dto, user.id);
  }

  @Get()
  @Roles(RoleName.ADMIN)
  findAll(
    @Param('scheduleId')
    scheduleId: string,
  ) {
    return this.service.findAll(scheduleId);
  }

  @Delete(':assignmentId')
  @Roles(RoleName.ADMIN)
  remove(
    @Param('scheduleId')
    scheduleId: string,
    @Param('assignmentId')
    assignmentId: string,
  ) {
    return this.service.remove(scheduleId, assignmentId);
  }
}
