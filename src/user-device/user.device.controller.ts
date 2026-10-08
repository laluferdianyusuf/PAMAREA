import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { DeviceService } from './user.device.service.js';

export class RegisterDeviceDto {
  userId: string; // Sebaiknya ambil dari req.user jika pakai JWT Auth Guard
  deviceIdentifier: string; // FCM Token
  platform?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
}

@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  /**
   * Endpoint: POST /device/register
   * Dipanggil oleh HP Satpam sesaat setelah Login sukses
   */
  @Post('register')
  async register(@Body() body: RegisterDeviceDto) {
    if (!body.userId || !body.deviceIdentifier) {
      throw new UnauthorizedException(
        'User ID dan Device Identifier wajib diisi',
      );
    }

    return this.deviceService.registerDevice(body.userId, {
      deviceIdentifier: body.deviceIdentifier,
      platform: body.platform,
      model: body.model,
      osVersion: body.osVersion,
      appVersion: body.appVersion,
    });
  }
}
