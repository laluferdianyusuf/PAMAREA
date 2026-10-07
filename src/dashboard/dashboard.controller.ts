import { Controller, Get } from '@nestjs/common';

import { DashboardService } from './dashboard.service.js';

import { UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import type { User } from '../generated/prisma/client.js';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('me')
  async getMyDashboard(@CurrentUser() user: User) {
    return this.dashboardService.getMyDashboard(user.id);
  }

  @Get('test')
  test() {
    return {
      success: true,
      message: 'Dashboard endpoint works',
    };
  }
}
