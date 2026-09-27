import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { User } from '../generated/prisma/client.js';
import { BypassNfcDto } from './dto/bypass-nfc.dto.js';
import { ValidateLocationDto } from './dto/validate-location.dto.js';
import { ValidateNfcDto } from './dto/validate-nfc.dto.js';
import { PatrolsService } from './patrols.service.js';

@Controller('patrols')
export class PatrolsController {
  constructor(private readonly patrolsService: PatrolsService) {}

  @Post(':id/validate-location')
  async validateLocation(
    @Param('id') patrolId: string,

    @CurrentUser() user: User,

    @Body() dto: ValidateLocationDto,
  ) {
    return {
      success: true,

      message: 'Lokasi berhasil divalidasi',

      data: await this.patrolsService.validateLocation(patrolId, user.id, dto),
    };
  }

  @Post(':id/validate-nfc')
  async validateNfc(
    @Param('id') patrolId: string,

    @CurrentUser() user: User,

    @Body() dto: ValidateNfcDto,
  ) {
    return {
      success: true,

      message: 'NFC berhasil divalidasi',

      data: await this.patrolsService.validateNfc(patrolId, user.id, dto.uid),
    };
  }

  @Post(':id/bypass-nfc')
  async bypassNfc(
    @Param('id') patrolId: string,

    @CurrentUser() user: User,

    @Body() dto: BypassNfcDto,
  ) {
    return {
      success: true,

      message: 'NFC berhasil dibypass',

      data: await this.patrolsService.bypassNfc(patrolId, user.id, dto),
    };
  }
}
