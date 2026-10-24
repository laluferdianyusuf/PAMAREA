import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { PatrolScheduleAssignmentRouteService } from '../services/patrol-schedule-assignment-route.service.js';

import { RedirectCheckpointDto } from '../dto/redirect-checkpoint.dto.js';
import { SetAssignmentRouteDto } from '../dto/set-assignment-route.dto.js';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { User } from '../../generated/prisma/client.js';
import { OptimizeAssignmentRouteDto } from '../dto/optimize-assignment-route.dto.js';

@Controller('patrol-schedule-assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class PatrolScheduleAssignmentRouteController {
  constructor(
    private readonly routeService: PatrolScheduleAssignmentRouteService,
  ) {}

  @Get(':assignmentId/route')
  getRoute(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.routeService.getRoute(assignmentId);
  }

  @Put(':assignmentId/route')
  setRoute(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: SetAssignmentRouteDto,
  ) {
    return this.routeService.setRoute(assignmentId, dto);
  }

  @Post(':assignmentId/route/optimize')
  optimizeRoute(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: OptimizeAssignmentRouteDto,
  ) {
    return this.routeService.optimizeRoute(assignmentId, dto);
  }

  @Put('rounds/:roundId/checkpoints/:checkpointId/redirect')
  redirectCheckpoint(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Param('checkpointId', ParseUUIDPipe) checkpointId: string,
    @Body() dto: RedirectCheckpointDto,
    @CurrentUser() user: User,
  ) {
    const changedById = user.id;

    return this.routeService.redirectCheckpoint(
      roundId,
      checkpointId,
      dto,
      changedById,
    );
  }
}
