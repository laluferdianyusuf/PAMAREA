import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PatrolCheckpointStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class PatrolRoundService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const round = await this.prisma.patrolRound.findUnique({
      where: { id },
      include: {
        assignment: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                employeeNumber: true,
              },
            },
            schedule: true,
          },
        },
        scheduleDate: true,
        checkpoints: {
          orderBy: {
            sequence: 'asc',
          },
        },
      },
    });

    if (!round) {
      throw new NotFoundException('Patrol round not found');
    }

    return round;
  }

  async start(id: string) {
    const round = await this.findById(id);

    if (round.status !== 'PENDING') {
      throw new ConflictException('Round cannot be started');
    }

    return this.prisma.patrolRound.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
  }

  async getRounds(userId: string, date?: string) {
    await this.syncOverdueRounds();
    const dateKey = date ?? this.getTodayDateKey();

    if (!this.isValidDateKey(dateKey)) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'Tanggal harus menggunakan format YYYY-MM-DD',
      });
    }

    const scheduleDate = new Date(`${dateKey}T00:00:00.000Z`);

    const rounds = await this.prisma.patrolRound.findMany({
      where: {
        assignment: {
          userId,
        },
        scheduleDate: {
          date: scheduleDate,
        },
      },
      include: {
        assignment: {
          include: {
            schedule: {
              include: {
                site: true,
              },
            },
          },
        },
        scheduleDate: true,
        checkpoints: {
          orderBy: {
            sequence: 'asc',
          },
          include: {
            patrolPoint: true,
          },
        },
      },
      orderBy: [
        {
          scheduledStartAt: 'asc',
        },
        {
          roundNumber: 'asc',
        },
      ],
    });

    return {
      date: dateKey,
      totalRounds: rounds.length,
      data: rounds.map((round) => {
        const checkpoints = round.checkpoints;
        const required = checkpoints.filter((item) => item.required);
        const completedRequired = required.filter(
          (item) => item.status === PatrolCheckpointStatus.COMPLETED,
        );
        const missed = checkpoints.filter(
          (item) =>
            item.status === PatrolCheckpointStatus.MISSED ||
            item.status === PatrolCheckpointStatus.FAILED,
        );

        const progress =
          required.length === 0
            ? 0
            : Math.round((completedRequired.length / required.length) * 100);

        return {
          id: round.id,
          roundNumber: round.roundNumber,
          status: round.status,
          scheduledStartAt: round.scheduledStartAt,
          scheduledEndAt: round.scheduledEndAt,
          startedAt: round.startedAt,
          completedAt: round.completedAt,

          schedule: {
            id: round.assignment.schedule.id,
            name: round.assignment.schedule.name,
            startTime: round.assignment.schedule.startTime,
            endTime: round.assignment.schedule.endTime,
            intervalMinutes: round.assignment.schedule.intervalMinutes,
            enforceSequence: round.assignment.schedule.enforceSequence,
          },

          site: {
            id: round.assignment.schedule.site.id,
            code: round.assignment.schedule.site.code,
            name: round.assignment.schedule.site.name,
            address: round.assignment.schedule.site.address,
          },

          progress: {
            totalCheckpoints: checkpoints.length,
            requiredCheckpoints: required.length,
            completedCheckpoints: completedRequired.length,
            missedCheckpoints: missed.length,
            percentage: progress,
          },

          checkpoints: checkpoints.map((checkpoint) => ({
            id: checkpoint.id,
            sequence: checkpoint.sequence,
            status: checkpoint.status,
            required: checkpoint.required,
            visitedAt: checkpoint.visitedAt,
            patrolPoint: {
              id: checkpoint.patrolPoint.id,
              name: checkpoint.patrolPoint.name,
              latitude: checkpoint.patrolPoint.latitude,
              longitude: checkpoint.patrolPoint.longitude,
              radiusMeters: checkpoint.patrolPoint.radiusMeters,
            },
          })),
        };
      }),
    };
  }

  async getRoundDetail(userId: string, roundId: string) {
    const round = await this.prisma.patrolRound.findUnique({
      where: {
        id: roundId,
      },
      include: {
        assignment: {
          include: {
            schedule: {
              include: {
                site: true,
              },
            },
          },
        },
        scheduleDate: true,
        checkpoints: {
          orderBy: {
            sequence: 'asc',
          },
          include: {
            patrolPoint: true,
          },
        },
      },
    });

    if (!round) {
      throw new NotFoundException({
        code: 'ROUND_NOT_FOUND',
        message: 'Ronde patroli tidak ditemukan',
      });
    }

    if (round.assignment.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'ROUND_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke ronde ini',
      });
    }

    const checkpoints = round.checkpoints;
    const required = checkpoints.filter((item) => item.required);
    const completed = required.filter(
      (item) => item.status === PatrolCheckpointStatus.COMPLETED,
    );
    const missed = checkpoints.filter(
      (item) =>
        item.status === PatrolCheckpointStatus.MISSED ||
        item.status === PatrolCheckpointStatus.FAILED,
    );

    return {
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      scheduledStartAt: round.scheduledStartAt,
      scheduledEndAt: round.scheduledEndAt,
      startedAt: round.startedAt,
      completedAt: round.completedAt,

      schedule: {
        id: round.assignment.schedule.id,
        name: round.assignment.schedule.name,
        startTime: round.assignment.schedule.startTime,
        endTime: round.assignment.schedule.endTime,
        intervalMinutes: round.assignment.schedule.intervalMinutes,
        gracePeriodMinutes: round.assignment.schedule.gracePeriodMinutes,
        enforceSequence: round.assignment.schedule.enforceSequence,
      },

      site: {
        id: round.assignment.schedule.site.id,
        code: round.assignment.schedule.site.code,
        name: round.assignment.schedule.site.name,
        address: round.assignment.schedule.site.address,
      },

      progress: {
        totalCheckpoints: checkpoints.length,
        requiredCheckpoints: required.length,
        completedCheckpoints: completed.length,
        missedCheckpoints: missed.length,
        percentage:
          required.length === 0
            ? 0
            : Math.round((completed.length / required.length) * 100),
      },

      checkpoints: checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        sequence: checkpoint.sequence,
        status: checkpoint.status,
        required: checkpoint.required,
        visitedAt: checkpoint.visitedAt,
        patrolPoint: {
          id: checkpoint.patrolPoint.id,
          name: checkpoint.patrolPoint.name,
          latitude: checkpoint.patrolPoint.latitude,
          longitude: checkpoint.patrolPoint.longitude,
          radiusMeters: checkpoint.patrolPoint.radiusMeters,
        },
      })),
    };
  }

  async syncOverdueRounds() {
    const now = new Date();

    const overdueRounds = await this.prisma.patrolRound.findMany({
      where: {
        status: {
          in: ['PENDING', 'IN_PROGRESS'],
        },
        scheduledEndAt: {
          lt: now,
        },
      },
      select: {
        id: true,
      },
    });

    let updatedRounds = 0;

    for (const round of overdueRounds) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const currentRound = await tx.patrolRound.findUnique({
          where: {
            id: round.id,
          },
          select: {
            id: true,
            status: true,
            scheduledEndAt: true,
            checkpoints: {
              select: {
                status: true,
              },
            },
          },
        });

        if (
          !currentRound ||
          !['PENDING', 'IN_PROGRESS'].includes(currentRound.status) ||
          currentRound.scheduledEndAt >= now
        ) {
          return 0;
        }

        const hasCompletedCheckpoint = currentRound.checkpoints.some(
          (checkpoint) => checkpoint.status === 'COMPLETED',
        );

        const finalStatus =
          currentRound.status === 'IN_PROGRESS' && hasCompletedCheckpoint
            ? 'PARTIAL'
            : 'MISSED';

        const result = await tx.patrolRound.updateMany({
          where: {
            id: currentRound.id,
            status: {
              in: ['PENDING', 'IN_PROGRESS'],
            },
            scheduledEndAt: {
              lt: now,
            },
          },
          data: {
            status: finalStatus,
            completedAt: now,
          },
        });

        if (result.count === 0) {
          return 0;
        }

        await tx.patrolCheckpoint.updateMany({
          where: {
            roundId: currentRound.id,
            status: 'PENDING',
          },
          data: {
            status: 'MISSED',
          },
        });

        return result.count;
      });

      updatedRounds += updated;
    }

    return {
      checked: overdueRounds.length,
      updated: updatedRounds,
      checkedAt: now.toISOString(),
    };
  }

  @Cron('*/1 * * * *', {
    timeZone: 'Asia/Jakarta',
  })
  async handleOverdueRounds() {
    const result = await this.syncOverdueRounds();
  }

  private getTodayDateKey(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    return `${values.year}-${values.month}-${values.day}`;
  }

  private isValidDateKey(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }
}
