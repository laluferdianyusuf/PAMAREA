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
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { User } from '../../generated/prisma/client.js';
import { CreateShiftChangeDto } from '../dto/change.shift.dto.js';
import { ShiftChangeService } from '../services/shift.change.service.js';

@Controller('shift-changes')
@UseGuards(JwtAuthGuard)
export class ShiftChangeController {
  constructor(private readonly shiftChangeService: ShiftChangeService) {}

  @Post('swap')
  @Roles('ADMIN')
  swap(@Body() dto: CreateShiftChangeDto, @CurrentUser() user: User) {
    return this.shiftChangeService.request(dto, user.id);
  }

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('effectiveDate') effectiveDate?: string,
  ) {
    return this.shiftChangeService.findAll({
      status,
      effectiveDate,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shiftChangeService.findOne(id);
  }
}
