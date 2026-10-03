import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GenerateScheduleDto } from '../dto/generate.schedule.dto.js';

@Injectable()
export class ScheduleGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(scheduleId: string, dto: GenerateScheduleDto) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: {
        id: scheduleId,
      },
      include: {
        points: {
          where: {
            required: true,
          },
          include: {
            patrolPoint: true,
          },
          orderBy: {
            sequence: 'asc',
          },
        },
        dates: true,
        assignments: {
          where: {
            status: 'ACTIVE',
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

    const dates = this.getDates(startDate, endDate);

    let generatedDates = 0;
    let generatedRounds = 0;
    let generatedCheckpoints = 0;

    for (const date of dates) {
      const result = await this.generateForDate(
        schedule,
        date,
        dto.force ?? false,
      );

      generatedDates += result.dateCreated;
      generatedRounds += result.roundsCreated;
      generatedCheckpoints += result.checkpointsCreated;
    }

    return {
      scheduleId,
      generatedDates,
      generatedRounds,
      generatedCheckpoints,
    };
  }

  private async generateForDate(schedule: any, date: Date, force: boolean) {
    let dateCreated = 0;
    let roundsCreated = 0;
    let checkpointsCreated = 0;

    const existingDate = await this.prisma.patrolScheduleDate.findUnique({
      where: {
        scheduleId_date: {
          scheduleId: schedule.id,
          date,
        },
      },
    });

    if (existingDate?.status === 'CANCELLED') {
      return {
        dateCreated: 0,
        roundsCreated: 0,
        checkpointsCreated: 0,
      };
    }

    const scheduleDate =
      existingDate ??
      (await this.prisma.patrolScheduleDate.create({
        data: {
          scheduleId: schedule.id,
          date,
        },
      }));

    if (!existingDate) {
      dateCreated = 1;
    }

    const activeAssignments = schedule.assignments.filter((assignment: any) =>
      this.isAssignmentActive(assignment, date),
    );

    const rounds = this.buildRounds(
      date,
      schedule.startTime,
      schedule.endTime,
      schedule.intervalMinutes,
    );

    for (const assignment of activeAssignments) {
      for (const round of rounds) {
        const existingRound = await this.prisma.patrolRound.findUnique({
          where: {
            scheduleDateId_assignmentId_roundNumber: {
              scheduleDateId: scheduleDate.id,

              assignmentId: assignment.id,

              roundNumber: round.roundNumber,
            },
          },
        });

        if (existingRound && !force) {
          continue;
        }

        const createdRound =
          existingRound ??
          (await this.prisma.patrolRound.create({
            data: {
              scheduleDateId: scheduleDate.id,

              assignmentId: assignment.id,

              roundNumber: round.roundNumber,

              scheduledStartAt: round.scheduledStartAt,

              scheduledEndAt: round.scheduledEndAt,
            },
          }));

        if (!existingRound) {
          roundsCreated++;
        }

        for (const point of schedule.points) {
          const existingCheckpoint =
            await this.prisma.patrolCheckpoint.findUnique({
              where: {
                roundId_patrolPointId: {
                  roundId: createdRound.id,

                  patrolPointId: point.patrolPointId,
                },
              },
            });

          if (existingCheckpoint) {
            continue;
          }

          await this.prisma.patrolCheckpoint.create({
            data: {
              roundId: createdRound.id,

              patrolPointId: point.patrolPointId,

              sequence: point.sequence,

              required: point.required,

              pointCodeSnapshot: point.patrolPoint.code,

              pointNameSnapshot: point.patrolPoint.name,

              radiusMetersSnapshot: point.patrolPoint.radiusMeters,
            },
          });

          checkpointsCreated++;
        }
      }
    }

    return {
      dateCreated,
      roundsCreated,
      checkpointsCreated,
    };
  }

  private buildRounds(
    date: Date,
    startTime: string,
    endTime: string,
    intervalMinutes: number,
  ) {
    const start = this.combineDateTime(date, startTime);

    const end = this.combineDateTime(date, endTime);

    const result = [];

    let cursor = new Date(start);

    let roundNumber = 1;

    while (cursor < end) {
      const next = new Date(
        Math.min(cursor.getTime() + intervalMinutes * 60_000, end.getTime()),
      );

      result.push({
        roundNumber,
        scheduledStartAt: new Date(cursor),
        scheduledEndAt: new Date(next),
      });

      cursor = next;
      roundNumber++;
    }

    return result;
  }

  private isAssignmentActive(assignment: any, date: Date) {
    const start = new Date(assignment.startDate);

    const end = assignment.endDate ? new Date(assignment.endDate) : null;

    return date >= start && (!end || date <= end);
  }

  private combineDateTime(date: Date, time: string) {
    const [hour, minute] = time.split(':').map(Number);

    const result = new Date(date);

    result.setUTCHours(hour, minute, 0, 0);

    return result;
  }

  private getDates(start: Date, end: Date) {
    const dates: Date[] = [];

    const current = new Date(start);

    while (current <= end) {
      dates.push(new Date(current));

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  private parseDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }
}
