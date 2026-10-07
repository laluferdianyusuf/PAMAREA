import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { PatrolsService } from './patrols.service.js';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { BypassNfcDto } from './dto/bypass-nfc.dto.js';
import { StartPatrolDto } from './dto/start-patrol.dto.js';
import { SubmitAnswersDto } from './dto/submit-answers.dto.js';
import { SubmitPhotoDto } from './dto/submit-photo.dto.js';
import { ValidateLocationDto } from './dto/validate-location.dto.js';

@Controller('patrols')
@UseGuards(JwtAuthGuard)
export class PatrolsController {
  constructor(private readonly patrolsService: PatrolsService) {}

  @Get('today')
  getToday(@CurrentUser('id') userId: string) {
    return this.patrolsService.getToday(userId);
  }

  @Post('checkpoints/:checkpointId/start')
  startPatrol(
    @Param('checkpointId') checkpointId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: StartPatrolDto,
  ) {
    return this.patrolsService.startPatrol(checkpointId, userId, dto);
  }

  @Get(':patrolId')
  getPatrol(
    @Param('patrolId') patrolId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.patrolsService.getPatrol(patrolId, userId);
  }

  @Post(':patrolId/validate-location')
  validateLocation(
    @Param('patrolId') patrolId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ValidateLocationDto,
  ) {
    return this.patrolsService.validateLocation(patrolId, userId, dto);
  }

  @Post(':patrolId/validate-nfc')
  validateNfc(
    @Param('patrolId') patrolId: string,
    @CurrentUser('id') userId: string,
    @Body() uid: string,
  ) {
    return this.patrolsService.validateNfc(patrolId, userId, uid);
  }

  @Post(':patrolId/bypass-nfc')
  bypassNfc(
    @Param('patrolId') patrolId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: BypassNfcDto,
  ) {
    return this.patrolsService.bypassNfc(patrolId, userId, dto);
  }

  @Put(':patrolId/answers')
  submitAnswers(
    @Param('patrolId') patrolId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitAnswersDto,
  ) {
    return this.patrolsService.submitAnswers(patrolId, userId, dto);
  }

  @Post(':patrolId/photos')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          return callback(
            new BadRequestException({
              code: 'INVALID_FILE_TYPE',
              message: 'File harus berupa gambar',
            }),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async addPhoto(
    @Param('patrolId') patrolId: string,
    @Body() dto: SubmitPhotoDto,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    return this.patrolsService.addPhoto(patrolId, req.user.id, dto, file);
  }

  @Post(':patrolId/submit')
  submitPatrol(
    @Param('patrolId') patrolId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.patrolsService.submitPatrol(patrolId, userId);
  }
}
