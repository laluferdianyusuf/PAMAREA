import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { User } from '../../generated/prisma/client.js';
import { RoleName } from '../../generated/prisma/enums.js';
import { AddPointDto } from '../dto/add.point.dto.js';
import {
  CreateManySchedulePointsDto,
  CreateSchedulePointDto,
} from '../dto/create.schedule.point.dto.js';
import { UpdateSchedulePointDto } from '../dto/update.schedule.point.dto.js';
import { PatrolSchedulePointService } from '../services/patrol.schedule.point.service.js';

@Controller('patrol-schedules-points')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatrolSchedulePointController {
  constructor(private readonly service: PatrolSchedulePointService) {}

  @Post(':scheduleId')
  @Roles(RoleName.ADMIN)
  add(
    @Param('scheduleId')
    scheduleId: string,
    @Body()
    dto: CreateSchedulePointDto,
    @CurrentUser() user: User,
  ) {
    return this.service.add(scheduleId, dto, user.id);
  }

  @Post(':scheduleId/many')
  @Roles(RoleName.ADMIN)
  addMany(
    @Param('scheduleId')
    scheduleId: string,

    @Body()
    dto: CreateManySchedulePointsDto,
    @CurrentUser() user: User,
  ) {
    return this.service.addMany(scheduleId, dto, user.id);
  }

  @Post(':scheduleId/new-point')
  async addPoint(
    @Param('scheduleId') scheduleId: string,
    @Body() dto: AddPointDto,
    @CurrentUser() user: User,
  ) {
    const isRequired = dto.required ?? true;

    return this.service.addPoint(
      scheduleId,
      dto.patrolPointId,
      dto.insertAtSequence,
      user.id,
      isRequired,
    );
  }

  @Get(':scheduleId')
  @Roles(RoleName.ADMIN)
  findAll(
    @Param('scheduleId')
    scheduleId: string,
  ) {
    return this.service.findAll(scheduleId);
  }

  @Patch(':scheduleId/:pointId')
  @Roles(RoleName.ADMIN)
  update(
    @Param('scheduleId')
    scheduleId: string,
    @Param('pointId')
    pointId: string,
    @Body()
    dto: UpdateSchedulePointDto,
    @CurrentUser() user: User,
  ) {
    return this.service.update(scheduleId, pointId, dto, user.id);
  }

  @Delete(':scheduleId/:pointId')
  @Roles(RoleName.ADMIN)
  remove(
    @Param('scheduleId')
    scheduleId: string,
    @Param('pointId')
    pointId: string,
    @CurrentUser() user: User,
  ) {
    return this.service.remove(scheduleId, pointId, user.id);
  }
}
