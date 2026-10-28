import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { AuditLogService } from './audit.service.js';
import { QueryAuditLogDto } from './dto/query-audit-log.dto.js';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(@Query() query: QueryAuditLogDto) {
    return this.auditLogService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditLogService.findOne(id);
  }
}
