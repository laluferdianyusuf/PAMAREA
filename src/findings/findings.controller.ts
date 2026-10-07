import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import type { User } from '../generated/prisma/client.js';
import { AssignFindingDto } from './dto/assign-finding.dto.js';
import { CreateFindingDto } from './dto/create-finding.dto.js';
import { FindingQueryDto } from './dto/finding-query.dto.js';
import { ResolveFindingDto } from './dto/resolve-finding.dto.js';
import { UpdateFindingDto } from './dto/update-finding.dto.js';
import { FindingsService } from './findings.service.js';

@Controller('findings')
@UseGuards(JwtAuthGuard)
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateFindingDto) {
    return this.findingsService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: FindingQueryDto) {
    return this.findingsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.findingsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFindingDto) {
    return this.findingsService.update(id, dto);
  }

  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignFindingDto) {
    return this.findingsService.assign(id, dto);
  }

  @Patch(':id/start')
  start(@Param('id') id: string) {
    return this.findingsService.start(id);
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveFindingDto,
    @CurrentUser() user: User,
  ) {
    return this.findingsService.resolve(id, dto, user.id);
  }

  @Post(':findingId/photos')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
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
    @Param('findingId') findingId: string,
    @UploadedFile() file: any,
  ) {
    return this.findingsService.addPhoto(findingId, file);
  }

  @Delete(':id/photos/:photoId')
  removePhoto(@Param('id') id: string, @Param('photoId') photoId: string) {
    return this.findingsService.removePhoto(id, photoId);
  }
}
