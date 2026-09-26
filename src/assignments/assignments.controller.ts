import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { AssignmentStatus } from '../generated/prisma/enums.js';
import { PatrolAssignmentService } from './assignments.service.js';
import { CreatePatrolAssignmentDto } from './dto/create-assignments.dto.js';
import { UpdatePatrolAssignmentDto } from './dto/update-assignments.dto.js';

@Controller('patrol-assignments')
@UseGuards(JwtAuthGuard)
export class PatrolAssignmentController {
  constructor(private readonly service: PatrolAssignmentService) {}

  @Post()
  create(@Body() dto: CreatePatrolAssignmentDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.userId);
  }

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('patrolPointId') patrolPointId?: string,
    @Query('status') status?: AssignmentStatus,
  ) {
    return this.service.findAll({
      userId,
      patrolPointId,
      status,
    });
  }

  @Get('active')
  findActive() {
    return this.service.findActive();
  }

  @Get('user/:userId')
  findActiveByUser(@Param('userId') userId: string) {
    return this.service.findActiveByUser(userId);
  }

  @Get('patrol-point/:patrolPointId')
  findActiveByPatrolPoint(@Param('patrolPointId') patrolPointId: string) {
    return this.service.findActiveByPatrolPoint(patrolPointId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatrolAssignmentDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}
