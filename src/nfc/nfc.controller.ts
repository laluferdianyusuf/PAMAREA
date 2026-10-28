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
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import type { User } from '../generated/prisma/client.js';
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
  create(@Body() dto: CreateNfcTagDto, @CurrentUser() user: User) {
    return this.nfcService.create(dto, user.id);
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
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNfcTagDto,
    @CurrentUser() user: User,
  ) {
    return this.nfcService.update(id, dto, user.id);
  }

  @Patch(':id/activate')
  @Roles('ADMIN')
  activate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.nfcService.activate(id, user.id);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  deactivate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.nfcService.deactivate(id, user.id);
  }

  @Patch(':id/damaged')
  @Roles('ADMIN')
  markDamaged(@Param('id') id: string, @CurrentUser() user: User) {
    return this.nfcService.markDamaged(id, user.id);
  }

  @Patch(':id/lost')
  @Roles('ADMIN')
  markLost(@Param('id') id: string, @CurrentUser() user: User) {
    return this.nfcService.markLost(id, user.id);
  }

  @Post(':id/replace')
  @Roles('ADMIN')
  replace(
    @Param('id') id: string,
    @Body() dto: ReplaceNfcTagDto,
    @CurrentUser() user: User,
  ) {
    return this.nfcService.replace(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.nfcService.remove(id, user.id);
  }
}
