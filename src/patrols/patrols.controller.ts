import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { PatrolsService } from './patrols.service.js';

import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import type { PatrolStatus, User } from '../generated/prisma/client.js';
import { BypassNfcDto } from './dto/bypass-nfc.dto.js';
import { ExportPatrolHistoryDto } from './dto/export-patrol-history.dto.js';
import { StartPatrolDto } from './dto/start-patrol.dto.js';
import { SubmitAnswersDto } from './dto/submit-answers.dto.js';
import { SubmitPhotoDto } from './dto/submit-photo.dto.js';
import { ValidateLocationDto } from './dto/validate-location.dto.js';
import { ValidateNfcDto } from './dto/validate-nfc.dto.js';
import { PatrolHistoryExportService } from './patrol-history-export.service.js';

@Controller('patrols')
@UseGuards(JwtAuthGuard)
export class PatrolsController {
  constructor(
    private readonly patrolsService: PatrolsService,
    private readonly patrolHistoryExportService: PatrolHistoryExportService,
  ) {}

  @Get('today')
  getToday(@CurrentUser() user: User) {
    return this.patrolsService.getToday(user.id);
  }

  @Get('history/grouped-by-user')
  @Roles('ADMIN')
  async getAllPatrolsGroupedByUser(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: PatrolStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.patrolsService.getAllPatrolsGroupedByUser({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
      status,
      startDate,
      endDate,
    });
  }

  @Post('checkpoints/:checkpointId/start')
  startPatrol(
    @Param('checkpointId') checkpointId: string,
    @CurrentUser() user: User,
    @Body() dto: StartPatrolDto,
  ) {
    return this.patrolsService.startPatrol(checkpointId, user.id, dto);
  }

  @Post('start-next')
  startNextPatrol(@CurrentUser() user: User) {
    return this.patrolsService.startNextPatrol(user.id);
  }

  @Get(':patrolId')
  getPatrol(@Param('patrolId') patrolId: string, @CurrentUser() user: User) {
    return this.patrolsService.getPatrol(patrolId, user.id);
  }

  @Post(':patrolId/validate-location')
  validateLocation(
    @Param('patrolId') patrolId: string,
    @CurrentUser() user: User,
    @Body() dto: ValidateLocationDto,
  ) {
    return this.patrolsService.validateLocation(patrolId, user.id, dto);
  }

  @Post(':patrolId/validate-nfc')
  validateNfc(
    @Param('patrolId') patrolId: string,
    @CurrentUser() user: User,
    @Body() dto: ValidateNfcDto,
  ) {
    return this.patrolsService.validateNfc(patrolId, user.id, dto.nfcUid);
  }

  @Post(':patrolId/bypass-nfc')
  bypassNfc(
    @Param('patrolId') patrolId: string,
    @CurrentUser() user: User,
    @Body() dto: BypassNfcDto,
  ) {
    return this.patrolsService.bypassNfc(patrolId, user.id, dto);
  }

  @Put(':patrolId/answers')
  submitAnswers(
    @Param('patrolId') patrolId: string,
    @CurrentUser() user: User,
    @Body() dto: SubmitAnswersDto,
  ) {
    return this.patrolsService.submitAnswers(patrolId, user.id, dto);
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
  submitPatrol(@Param('patrolId') patrolId: string, @CurrentUser() user: User) {
    return this.patrolsService.submitPatrol(patrolId, user.id);
  }

  @Post('export-excel')
  @Roles('ADMIN')
  async exportExcel(@Body() dto: ExportPatrolHistoryDto, @Res() res: Response) {
    const buffer = await this.patrolHistoryExportService.export(dto);

    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Makassar',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const filename = `Laporan-Patroli-${dateParts}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.end(buffer);
  }
}
