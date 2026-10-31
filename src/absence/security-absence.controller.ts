import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { User } from '../generated/prisma/client.js';
import { RoleName } from '../generated/prisma/enums.js';
import { CreateSecurityAbsenceDto } from './dto/create-security-absence.dto.js';
import { QuerySecurityAbsenceDto } from './dto/query-security-absence.dto.js';
import { SecurityAbsenceService } from './security-absence.service.js';

@Controller('security-absences')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
export class SecurityAbsenceController {
  constructor(
    private readonly securityAbsenceService: SecurityAbsenceService,
  ) {}

  @Post()
  create(@Body() dto: CreateSecurityAbsenceDto, @CurrentUser() user: User) {
    return this.securityAbsenceService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QuerySecurityAbsenceDto) {
    return this.securityAbsenceService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.securityAbsenceService.findOne(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.securityAbsenceService.cancel(id, user.id);
  }
}
