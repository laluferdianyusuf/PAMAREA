import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import type { User } from '../generated/prisma/client.js';
import { TriggerEmergencyDto } from './dto/trigger.emergency.dto.js';
import { EmergencyService } from './emergency.service.js';

@Controller('emergency')
@UseGuards(JwtAuthGuard)
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  @Post('trigger')
  async triggerEmergency(
    @Body() body: TriggerEmergencyDto,
    @CurrentUser() user: User,
  ) {
    return this.emergencyService.broadcastEmergency(
      user.id,
      user.siteId ?? '',
      {
        latitude: body.latitude,
        longitude: body.longitude,
        note: body.note,
      },
    );
  }
}
