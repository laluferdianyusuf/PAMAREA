import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreatePatrolPointDto } from './dto/create-patrol-points.dto.js';
import { UpdatePatrolPointDto } from './dto/update-patrol-points.dto.js';
import { PatrolPointsService } from './patrol-points.service.js';

@Controller('patrol-points')
export class PatrolPointsController {
  constructor(private readonly patrolPointsService: PatrolPointsService) {}

  @Post()
  create(@Body() dto: CreatePatrolPointDto) {
    return this.patrolPointsService.create(dto);
  }

  @Get()
  findAll(@Query('siteId') siteId?: string) {
    return this.patrolPointsService.findAll(siteId);
  }

  @Get('active')
  findActive(@Query('siteId') siteId?: string) {
    return this.patrolPointsService.findActive(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.patrolPointsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatrolPointDto) {
    return this.patrolPointsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.patrolPointsService.deactivate(id);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.patrolPointsService.activate(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.patrolPointsService.remove(id);
  }
}
