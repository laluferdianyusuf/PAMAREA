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
import { QuestionStatus, QuestionType } from '../generated/prisma/enums.js';
import { CreateQuestionOptionDto } from './dto/create-question-option.dto.js';
import { CreateQuestionDto } from './dto/create-questions.dto.js';
import { UpdateQuestionOptionDto } from './dto/update-question-option.dto.js';
import { UpdateQuestionDto } from './dto/update-questions.dto.js';
import { QuestionsService } from './questions.service.js';

@Controller('questions')
@UseGuards(JwtAuthGuard)
export class QuestionsController {
  constructor(private readonly service: QuestionsService) {}

  @Post()
  create(@Body() dto: CreateQuestionDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.userId);
  }

  @Get()
  findAll(
    @Query('status') status?: QuestionStatus,
    @Query('questionType')
    questionType?: QuestionType,
  ) {
    return this.service.findAll({
      status,
      questionType,
    });
  }

  @Get('active')
  findActive() {
    return this.service.findActive();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Post(':id/options')
  addOption(@Param('id') id: string, @Body() dto: CreateQuestionOptionDto) {
    return this.service.addOption(id, dto);
  }

  @Patch('options/:optionId')
  updateOption(
    @Param('optionId') optionId: string,
    @Body() dto: UpdateQuestionOptionDto,
  ) {
    return this.service.updateOption(optionId, dto);
  }

  @Patch('options/:optionId/delete')
  removeOption(@Param('optionId') optionId: string) {
    return this.service.removeOption(optionId);
  }
}
