import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { User } from '../../generated/prisma/client.js';
import { RoleName } from '../../generated/prisma/enums.js';
import {
  BulkAssignUserDto,
  CreateScheduleAssignmentDto,
} from '../dto/create.schedule.assignment.dto.js';
import { PatrolScheduleAssignmentService } from '../services/patrol.schedule.assignment.service.js';

@Controller('patrol-schedule-assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatrolScheduleAssignmentController {
  constructor(private readonly service: PatrolScheduleAssignmentService) {}

  @Post('schedules/:scheduleId/assign')
  @Roles(RoleName.ADMIN)
  create(
    @Param('scheduleId') scheduleId: string,
    @Body() dto: CreateScheduleAssignmentDto,
    @CurrentUser() user: User,
  ) {
    return this.service.create(scheduleId, dto, user.id);
  }

  @Post('bulk')
  @Roles(RoleName.ADMIN)
  async bulkAssignSatpam(
    @Body() dto: BulkAssignUserDto,
    @CurrentUser() user: User,
  ) {
    const result = await this.service.bulkAssignUser(dto, user.id);

    return {
      message: 'Jadwal shift bergilir berhasil disimpan',
      data: result,
    };
  }

  @Get()
  @Roles(RoleName.ADMIN)
  findAll(@Query('scheduleId') scheduleId?: string) {
    if (scheduleId) {
      return this.service.findAll(scheduleId);
    }

    return this.service.findAllAssignments();
  }

  @Delete('schedules/:scheduleId/:assignmentId')
  @Roles(RoleName.ADMIN)
  remove(
    @Param('scheduleId') scheduleId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.service.remove(scheduleId, assignmentId);
  }
}
