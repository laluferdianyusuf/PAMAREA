import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateScheduleDatesDto } from '../dto/create.schedule.data.dto.js';
import { PatrolSchedulePolicy } from '../policies/patrol.schedule.policy.service.js';

@Injectable()
export class PatrolScheduleDateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PatrolSchedulePolicy,
  ) {}

  async addDates(
    scheduleId: string,
    dto: CreateScheduleDatesDto,
    createdById: string,
  ) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    this.policy.assertDraft(schedule.status);

    const dates = [
      ...new Set(dto.dates.map((date) => this.normalizeDate(date))),
    ];

    await this.prisma.patrolScheduleDate.createMany({
      data: dates.map((date) => ({
        scheduleId,
        date,
        createdById,
      })),
      skipDuplicates: true,
    });

    return this.findAll(scheduleId);
  }

  async findAll(scheduleId: string) {
    return this.prisma.patrolScheduleDate.findMany({
      where: {
        scheduleId,
      },
      orderBy: {
        date: 'asc',
      },
    });
  }

  async cancel(scheduleId: string, dateId: string) {
    const date = await this.prisma.patrolScheduleDate.findFirst({
      where: {
        id: dateId,
        scheduleId,
      },
    });

    if (!date) {
      throw new NotFoundException('Schedule date not found');
    }

    if (date.status === 'COMPLETED') {
      throw new ConflictException(
        'Completed schedule date cannot be cancelled',
      );
    }

    return this.prisma.patrolScheduleDate.update({
      where: { id: dateId },
      data: {
        status: 'CANCELLED',
      },
    });
  }

  private normalizeDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }

    return date;
  }
}
