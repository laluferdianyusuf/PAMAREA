import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RoleName } from '../../generated/prisma/enums.js';
import { GenerateScheduleDto } from '../dto/generate.schedule.dto.js';
import { ScheduleGenerationService } from '../services/schedule.generation.service.js';

@Controller('patrol-schedules/:scheduleId/generate')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatrolScheduleGenerationController {
  constructor(private readonly service: ScheduleGenerationService) {}

  @Post()
  @Roles(RoleName.ADMIN)
  generate(
    @Param('scheduleId')
    scheduleId: string,

    @Body()
    dto: GenerateScheduleDto,
  ) {
    return this.service.generate(scheduleId, dto);
  }
}
