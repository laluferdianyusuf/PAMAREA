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

import { PatrolPointNfcService } from './patrol-point-nfc.service.js';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { AssignNfcDto } from './dto/assign-nfc.dto.js';
import { RemoveNfcAssignmentDto } from './dto/remove-nfc-assignment.dto.js';
import { ReplaceNfcAssignmentDto } from './dto/replace-nfc-assignment.dto.js';

@Controller('patrol-point-nfc')
@UseGuards(JwtAuthGuard)
export class PatrolPointNfcController {
  constructor(private readonly service: PatrolPointNfcService) {}

  @Post()
  assign(@Body() dto: AssignNfcDto, @CurrentUser() user: any) {
    return this.service.assign(dto, user.userId);
  }

  @Get()
  findAll(
    @Query('patrolPointId')
    patrolPointId?: string,

    @Query('nfcTagId')
    nfcTagId?: string,
  ) {
    return this.service.findAll(patrolPointId, nfcTagId);
  }

  @Get('history')
  findHistory(
    @Query('patrolPointId')
    patrolPointId?: string,

    @Query('nfcTagId')
    nfcTagId?: string,
  ) {
    return this.service.findHistory(patrolPointId, nfcTagId);
  }

  @Get('patrol-point/:patrolPointId')
  findActiveByPatrolPoint(
    @Param('patrolPointId')
    patrolPointId: string,
  ) {
    return this.service.findActiveByPatrolPoint(patrolPointId);
  }

  @Get('nfc/:nfcTagId')
  findActiveByNfc(
    @Param('nfcTagId')
    nfcTagId: string,
  ) {
    return this.service.findActiveByNfc(nfcTagId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/replace')
  replace(
    @Param('id') id: string,

    @Body()
    dto: ReplaceNfcAssignmentDto,

    @CurrentUser() user: any,
  ) {
    return this.service.replace(id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,

    @Body()
    dto: RemoveNfcAssignmentDto,
  ) {
    return this.service.remove(id, dto);
  }
}
