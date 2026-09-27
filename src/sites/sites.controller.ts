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
import type { User } from '../generated/prisma/client.js';
import { CreateSitesDto } from './dto/create-sites.dto.js';
import { UpdateSitesDto } from './dto/update-sites.dto.js';
import { SitesService } from './sites.service.js';

@Controller('sites')
@UseGuards(JwtAuthGuard)
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  findAll() {
    return this.sitesService.findAllSites();
  }

  @Get('active')
  findAllActive() {
    return this.sitesService.findAllActiveSites();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sitesService.findSiteById(id);
  }

  @Post()
  create(@Body() dto: CreateSitesDto, @CurrentUser() user: User) {
    return this.sitesService.createSite(dto, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSitesDto) {
    return this.sitesService.updateSite(id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.sitesService.deactivateSite(id);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.sitesService.activateSite(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sitesService.removeSite(id);
  }
}
