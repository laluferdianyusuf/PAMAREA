import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { AddFindingPhotoDto } from './dto/add-finding-photo.dto.js';
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
  create(@CurrentUser() user: any, @Body() dto: CreateFindingDto) {
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
    @CurrentUser() user: any,
  ) {
    return this.findingsService.resolve(id, dto, user.id);
  }

  @Post(':id/photos')
  addPhoto(@Param('id') id: string, @Body() dto: AddFindingPhotoDto) {
    return this.findingsService.addPhoto(id, dto);
  }

  @Delete(':id/photos/:photoId')
  removePhoto(@Param('id') id: string, @Param('photoId') photoId: string) {
    return this.findingsService.removePhoto(id, photoId);
  }
}
