import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PointQuestionsController } from './point-questions.controller.js';
import { PointQuestionsService } from './point-questions.service.js';
import { QuestionsController } from './questions.controller.js';
import { QuestionsService } from './questions.service.js';

@Module({
  imports: [PrismaModule],

  controllers: [QuestionsController, PointQuestionsController],

  providers: [QuestionsService, PointQuestionsService],

  exports: [QuestionsService, PointQuestionsService],
})
export class QuestionsModule {}
