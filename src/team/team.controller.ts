import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { User } from '../generated/prisma/client.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { QueryTeamDto } from './dto/query-team.dto.js';
import { UpdateTeamDto } from './dto/update-team.dto.js';
import { TeamService } from './team.service.js';

@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  findAll(@Query() query: QueryTeamDto) {
    return this.teamService.findAll(query);
  }

  @Get('active')
  findActive(@Query('siteId') siteId?: string) {
    return this.teamService.findActive(siteId);
  }

  @Get(':id')
  findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.teamService.findById(id);
  }

  @Post()
  create(
    @Body() dto: CreateTeamDto,
    @CurrentUser() user: User,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.teamService.create(dto, user.id, ipAddress, userAgent);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser() user: User,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.teamService.update(id, dto, user.id, ipAddress, userAgent);
  }

  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.teamService.remove(id, user.id, ipAddress, userAgent);
  }
}
