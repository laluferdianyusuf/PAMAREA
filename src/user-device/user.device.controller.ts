import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import type { User } from '../generated/prisma/client.js';
import { RegisterDeviceDto } from './dto/register.device.dto.js';
import { DeviceService } from './user.device.service.js';

@Controller('device')
@UseGuards(JwtAuthGuard)
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  /**
   * Endpoint: POST /device/register
   * Dipanggil oleh HP Satpam sesaat setelah Login sukses
   */
  @Post('register')
  async register(@Body() body: RegisterDeviceDto, @CurrentUser() user: User) {
    return this.deviceService.registerDevice(user.id, {
      deviceIdentifier: body.deviceIdentifier,
      platform: body.platform,
      model: body.model,
      osVersion: body.osVersion,
      appVersion: body.appVersion,
    });
  }
}
