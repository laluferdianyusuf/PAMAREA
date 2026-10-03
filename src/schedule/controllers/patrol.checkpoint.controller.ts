import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PatrolCheckpointService } from '../services/patrol.checkpoint.service.js';

@Controller('patrol-checkpoints')
@UseGuards(JwtAuthGuard)
export class PatrolCheckpointController {
  constructor(private readonly service: PatrolCheckpointService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
