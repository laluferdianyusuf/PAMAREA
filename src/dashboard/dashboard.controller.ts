import { Controller, Get, Query } from '@nestjs/common';

import { DashboardService } from './dashboard.service.js';

import { UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import type { User } from '../generated/prisma/client.js';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('mobile')
  async getMyDashboard(
    @Query('siteId') siteId: string,
    @CurrentUser() user: User,
  ) {
    return this.dashboardService.getMobileDashboard(user.id, siteId);
  }

  @Get('admin')
  @Roles('ADMIN')
  async getAdminDashboard(
    @Query('siteId') siteId: string,
    @Query('scheduleId') scheduleId?: string,
    @Query('startDate') startDateString?: string,
    @Query('endDate') endDateString?: string,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startDate = startDateString ? new Date(startDateString) : today;
    const endDate = endDateString ? new Date(endDateString) : tomorrow;

    if (startDateString && endDateString && startDateString === endDateString) {
      endDate.setDate(endDate.getDate() + 1);
    }

    return this.dashboardService.getAdminDashboard(
      siteId,
      startDate,
      endDate,
      scheduleId,
    );
  }

  @Get('test')
  test() {
    return {
      success: true,
      message: 'Dashboard endpoint works',
    };
  }
}
