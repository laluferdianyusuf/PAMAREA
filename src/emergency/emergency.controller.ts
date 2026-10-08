import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { EmergencyService } from './emergency.service.js';

// DTO (Data Transfer Object) untuk validasi request body
export class TriggerEmergencyDto {
  userId: string; // Idealnya dari JWT (req.user), tapi kita taruh di body untuk contoh
  siteId: string;
  latitude?: number;
  longitude?: number;
  note?: string;
}

@Controller('emergency')
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  /**
   * Endpoint: POST /emergency/trigger
   * Digunakan oleh aplikasi mobile satpam saat menekan tombol darurat.
   */
  @Post('trigger')
  async triggerEmergency(@Body() body: TriggerEmergencyDto) {
    // Pada arsitektur yang aman, userId dan siteId harusnya diambil dari ekstrak Token JWT
    // const userId = req.user.id;
    // const siteId = req.user.siteId;

    if (!body.userId || !body.siteId) {
      throw new UnauthorizedException('User ID dan Site ID harus disertakan');
    }

    return this.emergencyService.broadcastEmergency(body.userId, body.siteId, {
      latitude: body.latitude,
      longitude: body.longitude,
      note: body.note,
    });
  }
}
