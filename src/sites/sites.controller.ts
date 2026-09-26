import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { CreateSitesDto } from './dto/create-sites.dto.js';
import { UpdateSitesDto } from './dto/update-sites.dto.js';
import { SitesService } from './sites.service.js';

@Controller('sites')
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
  create(@Body() dto: CreateSitesDto) {
    return this.sitesService.createSite(dto);
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
