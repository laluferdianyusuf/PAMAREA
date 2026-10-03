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
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RoleName } from '../../generated/prisma/enums.js';
import {
  CreateManySchedulePointsDto,
  CreateSchedulePointDto,
} from '../dto/create.schedule.point.dto.js';
import { UpdateSchedulePointDto } from '../dto/update.schedule.point.dto.js';
import { PatrolSchedulePointService } from '../services/patrol.schedule.point.service.js';

@Controller('patrol-schedules/:scheduleId/points')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatrolSchedulePointController {
  constructor(private readonly service: PatrolSchedulePointService) {}

  @Post()
  @Roles(RoleName.ADMIN)
  add(
    @Param('scheduleId')
    scheduleId: string,
    @Body()
    dto: CreateSchedulePointDto,
  ) {
    return this.service.add(scheduleId, dto);
  }

  @Post('/many')
  @Roles(RoleName.ADMIN)
  addMany(
    @Param('scheduleId')
    scheduleId: string,

    @Body()
    dto: CreateManySchedulePointsDto,
  ) {
    return this.service.addMany(scheduleId, dto);
  }

  @Get()
  @Roles(RoleName.ADMIN)
  findAll(
    @Param('scheduleId')
    scheduleId: string,
  ) {
    return this.service.findAll(scheduleId);
  }

  @Patch(':pointId')
  @Roles(RoleName.ADMIN)
  update(
    @Param('scheduleId')
    scheduleId: string,
    @Param('pointId')
    pointId: string,
    @Body()
    dto: UpdateSchedulePointDto,
  ) {
    return this.service.update(scheduleId, pointId, dto);
  }

  @Delete(':pointId')
  @Roles(RoleName.ADMIN)
  remove(
    @Param('scheduleId')
    scheduleId: string,
    @Param('pointId')
    pointId: string,
  ) {
    return this.service.remove(scheduleId, pointId);
  }
}
