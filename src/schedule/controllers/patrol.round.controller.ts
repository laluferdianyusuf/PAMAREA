import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { User } from '../../generated/prisma/client.js';
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

  @Get()
  getRounds(@CurrentUser() user: User, @Query('date') date?: string) {
    return this.service.getRounds(user.id, date);
  }

  @Get(':roundId')
  getRoundDetail(
    @CurrentUser('userId') userId: string,
    @Param('roundId') roundId: string,
  ) {
    return this.service.getRoundDetail(userId, roundId);
  }
}
