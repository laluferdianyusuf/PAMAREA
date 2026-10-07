import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { CreatePatrolScheduleDto } from '../dto/create.schedule.dto.js';
import { ScheduleFilterDto } from '../dto/schedule.filter.dto.js';
import { UpdatePatrolScheduleDto } from '../dto/update.schedule.dto.js';
import { PatrolScheduleService } from '../services/patrol.schedule.service.js';

@Controller('patrol-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatrolScheduleController {
  constructor(private readonly service: PatrolScheduleService) {}

  @Post()
  @Roles(RoleName.ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreatePatrolScheduleDto) {
    return this.service.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: ScheduleFilterDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePatrolScheduleDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/activate')
  @Roles(RoleName.ADMIN)
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Post(':id/archive')
  @Roles(RoleName.ADMIN)
  archive(@Param('id') id: string) {
    return this.service.archive(id);
  }

  @Delete(':id')
  @Roles(RoleName.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
