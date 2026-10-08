import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScheduleGenerationService } from '../services/schedule.generation.service.js';

@Injectable()
export class ScheduleCronService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generationService: ScheduleGenerationService,
  ) {}

  @Cron('55 23 * * *')
  async generateDailyRounds() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().split('T')[0];

    const activeSchedules = await this.prisma.patrolSchedule.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const schedule of activeSchedules) {
      await this.generationService.generate(schedule.id, {
        startDate: dateString,
        endDate: dateString,
      });
    }
  }
}
