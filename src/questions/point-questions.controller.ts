import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { AssignQuestionDto } from './dto/assign-question.dto.js';
import { UpdatePointQuestionDto } from './dto/update-point-question.dto.js';
import { PointQuestionsService } from './point-questions.service.js';

@Controller('point-questions')
@UseGuards(JwtAuthGuard)
export class PointQuestionsController {
  constructor(private readonly service: PointQuestionsService) {}

  @Post()
  assign(@Body() dto: AssignQuestionDto, @CurrentUser() user: any) {
    return this.service.assign(dto, user.userId);
  }

  @Get('patrol-point/:patrolPointId')
  findByPatrolPoint(@Param('patrolPointId') patrolPointId: string) {
    return this.service.findByPatrolPoint(patrolPointId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePointQuestionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
