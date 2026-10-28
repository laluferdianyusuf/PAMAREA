import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ScheduleTimeUtil } from '../../common/utils/schedule-time.util.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GenerateScheduleDto } from '../dto/generate.schedule.dto.js';

type RoutePoint = {
  patrolPointId: string;
  required: boolean;
  patrolPoint: {
    code: string;
    name: string;
    radiusMeters: number;
  };
};

type RoundDefinition = {
  roundNumber: number;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
};

@Injectable()
export class ScheduleGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(scheduleId: string, dto: GenerateScheduleDto) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        points: {
          include: { patrolPoint: true },
          orderBy: { sequence: 'asc' },
        },
        assignments: {
          where: { status: 'ACTIVE' },
          include: {
            patrolPoints: {
              include: { patrolPoint: true },
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    if (schedule.status !== 'ACTIVE') {
      throw new ConflictException('Only ACTIVE schedule can be generated');
    }

    const startDate = this.parseDate(dto.startDate);
    const endDate = this.parseDate(dto.endDate);

    if (endDate < startDate) {
      throw new BadRequestException('End date cannot be before start date');
    }

    if (
      !Number.isInteger(schedule.intervalMinutes) ||
      schedule.intervalMinutes <= 0
    ) {
      throw new BadRequestException(
        'intervalMinutes harus berupa bilangan bulat positif.',
      );
    }

    for (const assignment of schedule.assignments) {
      const route = (
        assignment.patrolPoints.length > 0
          ? assignment.patrolPoints
          : schedule.points
      ) as RoutePoint[];

      this.validateRoute(route, assignment.id);
    }

    let generatedDates = 0;
    let generatedRounds = 0;
    let generatedCheckpoints = 0;
    let skippedRounds = 0;

    for (const date of this.getDates(startDate, endDate)) {
      const result = await this.generateForDate(
        schedule,
        date,
        dto.force ?? false,
      );

      generatedDates += result.dateCreated;
      generatedRounds += result.roundsCreated;
      generatedCheckpoints += result.checkpointsCreated;
      skippedRounds += result.roundsSkipped;
    }

    return {
      scheduleId,
      force: dto.force ?? false,
      generatedDates,
      generatedRounds,
      generatedCheckpoints,
      skippedRounds,
    };
  }

  private validateRoute(route: RoutePoint[], assignmentId: string) {
    if (route.length === 0) {
      throw new BadRequestException(
        `Tidak ada titik patroli untuk assignment ${assignmentId}`,
      );
    }

    const ids = route.map((point) => point.patrolPointId);

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        `Duplicate patrol point in route for assignment ${assignmentId}`,
      );
    }
  }

  private async generateForDate(schedule: any, date: Date, force: boolean) {
    let dateCreated = 0;
    let roundsCreated = 0;
    let checkpointsCreated = 0;
    let roundsSkipped = 0;

    let scheduleDate = await this.prisma.patrolScheduleDate.findUnique({
      where: {
        scheduleId_date: {
          scheduleId: schedule.id,
          date,
        },
      },
    });

    if (scheduleDate?.status === 'CANCELLED') {
      return {
        dateCreated,
        roundsCreated,
        checkpointsCreated,
        roundsSkipped,
      };
    }

    if (!scheduleDate) {
      try {
        scheduleDate = await this.prisma.patrolScheduleDate.create({
          data: {
            scheduleId: schedule.id,
            date,
          },
        });

        dateCreated = 1;
      } catch (error) {
        // Menangani kemungkinan request paralel membuat tanggal sama.
        scheduleDate = await this.prisma.patrolScheduleDate.findUnique({
          where: {
            scheduleId_date: {
              scheduleId: schedule.id,
              date,
            },
          },
        });

        if (!scheduleDate) {
          throw error;
        }
      }
    }

    if (scheduleDate.status === 'CANCELLED') {
      return {
        dateCreated,
        roundsCreated,
        checkpointsCreated,
        roundsSkipped,
      };
    }

    const assignments = schedule.assignments.filter((assignment: any) =>
      this.isAssignmentActive(assignment, date),
    );

    const rounds = this.buildRounds(
      date,
      schedule.startTime,
      schedule.endTime,
      schedule.intervalMinutes,
    );

    for (const assignment of assignments) {
      const route = (
        assignment.patrolPoints.length > 0
          ? assignment.patrolPoints
          : schedule.points
      ) as RoutePoint[];

      this.validateRoute(route, assignment.id);

      for (const round of rounds) {
        const result = await this.generateRound(
          scheduleDate.id,
          assignment.id,
          round,
          route,
          force,
        );

        if (result.created) {
          roundsCreated++;
        }

        if (result.skipped) {
          roundsSkipped++;
        }

        checkpointsCreated += result.checkpointsCreated;
      }
    }

    return {
      dateCreated,
      roundsCreated,
      checkpointsCreated,
      roundsSkipped,
    };
  }

  private async generateRound(
    scheduleDateId: string,
    assignmentId: string,
    round: RoundDefinition,
    route: RoutePoint[],
    force: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      let existingRound = await tx.patrolRound.findUnique({
        where: {
          scheduleDateId_assignmentId_roundNumber: {
            scheduleDateId,
            assignmentId,
            roundNumber: round.roundNumber,
          },
        },
        include: {
          checkpoints: {
            select: {
              id: true,
              patrolPointId: true,
              sequence: true,
              status: true,
            },
          },
        },
      });

      // Ronde selesai adalah riwayat dan tidak boleh diubah.
      if (existingRound?.status === 'COMPLETED') {
        return {
          created: false,
          skipped: true,
          checkpointsCreated: 0,
        };
      }

      let created = false;

      if (!existingRound) {
        existingRound = await tx.patrolRound.create({
          data: {
            scheduleDateId,
            assignmentId,
            roundNumber: round.roundNumber,
            scheduledStartAt: round.scheduledStartAt,
            scheduledEndAt: round.scheduledEndAt,
          },
          include: {
            checkpoints: {
              select: {
                id: true,
                patrolPointId: true,
                sequence: true,
                status: true,
              },
            },
          },
        });

        created = true;
      }

      const existingPointIds = new Set(
        existingRound.checkpoints.map((checkpoint) => checkpoint.patrolPointId),
      );

      const missingPoints = route.filter(
        (point) => !existingPointIds.has(point.patrolPointId),
      );

      // Jika ronde sudah ada dan force=false, tetap sinkronkan
      // checkpoint yang belum tersedia.
      if (missingPoints.length > 0) {
        // Pindahkan sequence lama sementara agar tidak bentrok
        // dengan sequence akhir yang akan diterapkan.
        await tx.patrolCheckpoint.updateMany({
          where: { roundId: existingRound.id },
          data: {
            sequence: { increment: 100000 },
          },
        });

        // Buat checkpoint baru dengan sequence sementara.
        await tx.patrolCheckpoint.createMany({
          data: missingPoints.map((point, index) => ({
            roundId: existingRound.id,
            patrolPointId: point.patrolPointId,
            sequence: 200000 + index,
            required: point.required,
            pointCodeSnapshot: point.patrolPoint.code,
            pointNameSnapshot: point.patrolPoint.name,
            radiusMetersSnapshot: point.patrolPoint.radiusMeters,
          })),
        });
      }

      const checkpoints = await tx.patrolCheckpoint.findMany({
        where: { roundId: existingRound.id },
        select: {
          id: true,
          patrolPointId: true,
          sequence: true,
        },
      });

      const checkpointByPointId = new Map(
        checkpoints.map((checkpoint) => [checkpoint.patrolPointId, checkpoint]),
      );

      for (let index = 0; index < route.length; index++) {
        const point = route[index];
        const checkpoint = checkpointByPointId.get(point.patrolPointId);

        if (!checkpoint) {
          continue;
        }

        await tx.patrolCheckpoint.update({
          where: { id: checkpoint.id },
          data: { sequence: index + 1 },
        });
      }

      return {
        created,
        skipped: false,
        checkpointsCreated: missingPoints.length,
      };
    });
  }

  private buildRounds(
    date: Date,
    startTime: string,
    endTime: string,
    intervalMinutes: number,
  ): RoundDefinition[] {
    if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
      throw new BadRequestException(
        'intervalMinutes harus berupa bilangan bulat positif.',
      );
    }

    const startNormalized = ScheduleTimeUtil.normalizeTime(startTime);
    const endNormalized = ScheduleTimeUtil.normalizeTime(endTime);

    const [startHour, startMinute] = startNormalized.split(':').map(Number);

    const [endHour, endMinute] = endNormalized.split(':').map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    const endDayOffset = endMinutes <= startMinutes ? 1 : 0;

    const start = this.combineDateTime(date, startNormalized);
    const end = this.combineDateTime(date, endNormalized, endDayOffset);

    const rounds: RoundDefinition[] = [];
    let cursor = new Date(start);
    let roundNumber = 1;

    while (cursor < end) {
      const next = new Date(
        Math.min(cursor.getTime() + intervalMinutes * 60_000, end.getTime()),
      );

      rounds.push({
        roundNumber,
        scheduledStartAt: new Date(cursor),
        scheduledEndAt: new Date(next),
      });

      cursor = next;
      roundNumber++;
    }

    return rounds;
  }

  private parseDate(value: string): Date {
    return ScheduleTimeUtil.parseDate(value);
  }

  private combineDateTime(date: Date, time: string, dayOffset = 0): Date {
    return ScheduleTimeUtil.combineDateTime(date, time, dayOffset);
  }

  private isAssignmentActive(
    assignment: { startDate: Date; endDate: Date | null },
    date: Date,
  ): boolean {
    const start = new Date(assignment.startDate);
    const end = assignment.endDate ? new Date(assignment.endDate) : null;

    return date >= start && (!end || date <= end);
  }

  private getDates(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    const current = new Date(start);

    while (current <= end) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }
}
