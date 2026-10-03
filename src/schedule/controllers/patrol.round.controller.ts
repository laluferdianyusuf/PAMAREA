import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RoleName } from '../../generated/prisma/enums.js';
import { PatrolRoundService } from '../services/patrol.round.service.js';

@Controller('patrol-rounds')
@UseGuards(JwtAuthGuard)
export class PatrolRoundController {
  constructor(private readonly service: PatrolRoundService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post(':id/start')
  @Roles(RoleName.SECURITY)
  start(@Param('id') id: string) {
    return this.service.start(id);
  }
}
