import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditLogService } from '../../audit/audit.service.js';
import {
  PatrolCheckpointStatus,
  PatrolRoundStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ReorderRoundCheckpointsDto } from '../dto/reorder.round.checkpoints.dto.js';

@Injectable()
export class PatrolRoundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async reorderRoundCheckpoints(
    roundId: string,
    dto: ReorderRoundCheckpointsDto,
    adminId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const round = await tx.patrolRound.findUnique({
          where: { id: roundId },
          include: {
            checkpoints: {
              orderBy: { sequence: 'asc' },
              select: {
                id: true,
                sequence: true,
                status: true,
              },
            },
            assignment: {
              include: {
                schedule: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        });

        if (!round) {
          throw new NotFoundException('Ronde patroli tidak ditemukan');
        }

        if (round.status !== PatrolRoundStatus.PENDING) {
          throw new ConflictException(
            'Urutan checkpoint hanya dapat diubah pada ronde PENDING',
          );
        }

        const currentIds = round.checkpoints
          .map((checkpoint) => checkpoint.id)
          .sort();

        const requestedIds = [...dto.checkpointIds].sort();

        if (
          currentIds.length !== requestedIds.length ||
          currentIds.some((id, index) => id !== requestedIds[index])
        ) {
          throw new BadRequestException(
            'Daftar checkpoint harus mencakup seluruh checkpoint pada ronde ini tanpa menambah atau menghapus checkpoint',
          );
        }

        for (const checkpoint of round.checkpoints) {
          if (checkpoint.status !== PatrolCheckpointStatus.PENDING) {
            throw new ConflictException(
              'Ronde memiliki checkpoint yang bukan PENDING',
            );
          }
        }

        const oldOrder = round.checkpoints.map((checkpoint) => ({
          checkpointId: checkpoint.id,
          sequence: checkpoint.sequence,
        }));

        const temporaryOffset = round.checkpoints.length;

        for (const checkpoint of round.checkpoints) {
          await tx.patrolCheckpoint.update({
            where: { id: checkpoint.id },
            data: {
              sequence: checkpoint.sequence + temporaryOffset,
            },
          });
        }

        for (const [index, checkpointId] of dto.checkpointIds.entries()) {
          await tx.patrolCheckpoint.update({
            where: { id: checkpointId },
            data: {
              sequence: index + 1,
            },
          });
        }

        const updated = await tx.patrolRound.findUniqueOrThrow({
          where: { id: roundId },
          include: {
            checkpoints: {
              orderBy: { sequence: 'asc' },
            },
          },
        });

        const newOrder = updated.checkpoints.map((checkpoint) => ({
          checkpointId: checkpoint.id,
          sequence: checkpoint.sequence,
        }));

        await this.auditLogService.createAudit(tx, {
          userId: adminId,
          action: 'REORDER_ROUND_CHECKPOINTS',
          entityType: 'PatrolRound',
          entityId: roundId,
          oldData: {
            status: round.status,
            scheduleId: round.assignment.schedule.id,
            scheduleName: round.assignment.schedule.name,
            checkpoints: oldOrder,
          },
          newData: {
            status: updated.status,
            scheduleId: round.assignment.schedule.id,
            scheduleName: round.assignment.schedule.name,
            checkpoints: newOrder,
          },
        });

        return {
          message: 'Urutan checkpoint ronde berhasil diperbarui',
          roundId,
          checkpoints: updated.checkpoints,
        };
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

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
          include: {
            patrolPoint: {
              select: {
                id: true,
                name: true,
              },
            },
          },
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

  async getRoundsByUser(userId: string, date?: string) {
    await this.syncOverdueRounds();

    const dateKey = date ?? this.getTodayDateKey();

    if (!this.isValidDateKey(dateKey)) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'Tanggal harus menggunakan format YYYY-MM-DD',
      });
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundException('User tidak ditemukan');
    }

    const scheduleDate = new Date(`${dateKey}T00:00:00.000Z`);

    const rounds = await this.prisma.patrolRound.findMany({
      where: {
        assignment: {
          userId: targetUser.id,
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
      orderBy: [{ scheduledStartAt: 'asc' }, { roundNumber: 'asc' }],
    });

    return {
      userId: targetUser.id,
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

  async getAllRoundsGroupedByUser() {
    const rounds = await this.prisma.patrolRound.findMany({
      select: {
        id: true,
        roundNumber: true,
        status: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        startedAt: true,
        completedAt: true,

        assignment: {
          select: {
            user: {
              select: {
                id: true,
                employeeNumber: true,
                fullName: true,
                username: true,
              },
            },
            schedule: {
              select: {
                id: true,
                name: true,
                site: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },

        scheduleDate: {
          select: {
            id: true,
            date: true,
            status: true,
          },
        },

        checkpoints: {
          select: {
            id: true,
            sequence: true,
            required: true,
            status: true,
            pointCodeSnapshot: true,
            pointNameSnapshot: true,
            visitedAt: true,
          },
          orderBy: {
            sequence: 'asc',
          },
        },
      },

      orderBy: [{ scheduledStartAt: 'desc' }, { roundNumber: 'asc' }],
    });

    type Round = (typeof rounds)[number];

    const grouped = new Map<
      string,
      {
        user: Round['assignment']['user'];
        rounds: Round[];
      }
    >();

    for (const round of rounds) {
      const user = round.assignment.user;

      if (!grouped.has(user.id)) {
        grouped.set(user.id, {
          user,
          rounds: [],
        });
      }

      grouped.get(user.id)!.rounds.push(round);
    }

    return {
      totalUsers: grouped.size,
      totalRounds: rounds.length,
      data: Array.from(grouped.values()).map(({ user, rounds }) => ({
        user,
        rounds: rounds.map(({ assignment, ...round }) => ({
          ...round,
          schedule: assignment.schedule,
        })),
      })),
    };
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
