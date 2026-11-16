import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { PatrolWarningService } from './patrol-answer.service.js';

@Controller('patrol-warnings')
@UseGuards(JwtAuthGuard)
export class PatrolWarningController {
  constructor(private readonly patrolWarningService: PatrolWarningService) {}

  @Get(':patrolId')
  findOne(@Param('patrolId', ParseUUIDPipe) patrolId: string) {
    return this.patrolWarningService.findOne(patrolId);
  }
}
