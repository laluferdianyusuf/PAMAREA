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
import { NfcStatus } from '../generated/prisma/enums.js';
import { CreateNfcTagDto } from './dto/create-nfc.dto.js';
import { ReplaceNfcTagDto } from './dto/replace-nfc.dto.js';
import { UpdateNfcTagDto } from './dto/update-nfc.dto.js';
import { NfcService } from './nfc.service.js';

@Controller('nfc-tags')
@UseGuards(JwtAuthGuard)
export class NfcController {
  constructor(private readonly nfcService: NfcService) {}

  @Post()
  create(@Body() dto: CreateNfcTagDto, @CurrentUser() user: any) {
    return this.nfcService.create(dto, user.userId);
  }

  @Get()
  findAll(@Query('status') status?: NfcStatus) {
    return this.nfcService.findAll(status);
  }

  @Get('unassigned')
  findUnassigned() {
    return this.nfcService.findUnassigned();
  }

  @Get('uid/:uid')
  findByUid(@Param('uid') uid: string) {
    return this.nfcService.findByUid(uid);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nfcService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNfcTagDto) {
    return this.nfcService.update(id, dto);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.nfcService.activate(id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.nfcService.deactivate(id);
  }

  @Patch(':id/damaged')
  markDamaged(@Param('id') id: string) {
    return this.nfcService.markDamaged(id);
  }

  @Patch(':id/lost')
  markLost(@Param('id') id: string) {
    return this.nfcService.markLost(id);
  }

  @Post(':id/replace')
  replace(@Param('id') id: string, @Body() dto: ReplaceNfcTagDto) {
    return this.nfcService.replace(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nfcService.remove(id);
  }
}
