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
import { CreateScheduleDatesDto } from '../dto/create.schedule.data.dto.js';
import { PatrolScheduleDateService } from '../services/patrol.schedule.date.service.js';

@Controller('patrol-schedules/:scheduleId/dates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatrolScheduleDateController {
  constructor(private readonly service: PatrolScheduleDateService) {}

  @Post()
  @Roles(RoleName.ADMIN)
  add(
    @Param('scheduleId')
    scheduleId: string,
    @Body()
    dto: CreateScheduleDatesDto,
    @CurrentUser()
    user: User,
  ) {
    return this.service.addDates(scheduleId, dto, user.id);
  }

  @Get()
  @Roles(RoleName.ADMIN)
  findAll(
    @Param('scheduleId')
    scheduleId: string,
  ) {
    return this.service.findAll(scheduleId);
  }

  @Delete(':dateId')
  @Roles(RoleName.ADMIN)
  cancel(
    @Param('scheduleId')
    scheduleId: string,
    @Param('dateId')
    dateId: string,
  ) {
    return this.service.cancel(scheduleId, dateId);
  }
}
