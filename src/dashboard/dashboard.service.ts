import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PatrolRoundService } from '../schedule/services/patrol.round.service.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleRoundService: PatrolRoundService,
  ) {}

  private readonly timeZone = 'Asia/Makassar';

  private getTodayDateKey(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
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

  private getWitaMonthRange(dateKey: string) {
    const [year, month] = dateKey.split('-').map(Number);
    const offsetMs = 8 * 60 * 60 * 1000;

    const startOfMonth = new Date(Date.UTC(year, month - 1, 1) - offsetMs);

    const startOfNextMonth = new Date(Date.UTC(year, month, 1) - offsetMs);

    return { startOfMonth, startOfNextMonth };
  }

  private toWitaISOString(value: Date | string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATETIME',
        message: 'Tanggal patroli tidak valid',
      });
    }

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');

    return (
      `${values.year}-${values.month}-${values.day}` +
      `T${values.hour}:${values.minute}:${values.second}` +
      `.${milliseconds}+08:00`
    );
  }

  private getRemainingCheckpoints(
    checkpoints: Array<{ status: string }>,
  ): number {
    const terminalStatuses = ['COMPLETED', 'MISSED', 'FAILED', 'CANCELLED'];

    return checkpoints.filter(
      (checkpoint) => !terminalStatuses.includes(checkpoint.status),
    ).length;
  }

  async getMobileDashboard(userId: string, siteId: string) {
    await this.scheduleRoundService.syncOverdueRounds();

    const dateKey = this.getTodayDateKey();

    if (!this.isValidDateKey(dateKey)) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'Tanggal harus menggunakan format YYYY-MM-DD',
      });
    }

    const scheduleDate = new Date(`${dateKey}T00:00:00.000Z`);
    const nowMs = Date.now();

    const { startOfMonth, startOfNextMonth } = this.getWitaMonthRange(dateKey);

    const [todayRounds, user, site] = await Promise.all([
      this.prisma.patrolRound.findMany({
        where: {
          assignment: {
            userId,
            status: 'ACTIVE',
            schedule: {
              siteId,
            },
          },
          scheduleDate: {
            date: scheduleDate,
          },
        },
        include: {
          assignment: {
            include: {
              schedule: true,
            },
          },
          checkpoints: true,
        },
        orderBy: {
          scheduledStartAt: 'asc',
        },
      }),

      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      }),

      this.prisma.site.findUnique({
        where: { id: siteId },
        select: {
          id: true,
          name: true,
          address: true,
        },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (!site) {
      throw new NotFoundException('Site tidak ditemukan');
    }

    let totalCheckpoints = 0;
    let completedCheckpoints = 0;
    let missedCheckpoints = 0;

    for (const round of todayRounds) {
      totalCheckpoints += round.checkpoints.length;

      completedCheckpoints += round.checkpoints.filter(
        (checkpoint) => checkpoint.status === 'COMPLETED',
      ).length;

      missedCheckpoints += round.checkpoints.filter(
        (checkpoint) =>
          checkpoint.status === 'MISSED' || checkpoint.status === 'FAILED',
      ).length;
    }

    const progressPercentage =
      totalCheckpoints === 0
        ? 0
        : Math.round((completedCheckpoints / totalCheckpoints) * 100);

    const activeRounds = todayRounds.filter(
      (round) => round.status === 'IN_PROGRESS',
    );

    const currentRound =
      activeRounds[0] ??
      todayRounds.find((round) => {
        if (round.status !== 'PENDING') {
          return false;
        }

        const startMs = new Date(round.scheduledStartAt).getTime();
        const endMs = new Date(round.scheduledEndAt).getTime();

        return nowMs >= startMs && nowMs <= endMs;
      }) ??
      null;

    const nextPendingRound =
      todayRounds.find((round) => {
        if (round.status !== 'PENDING') {
          return false;
        }

        const startMs = new Date(round.scheduledStartAt).getTime();
        const endMs = new Date(round.scheduledEndAt).getTime();

        return startMs > nowMs && endMs >= nowMs;
      }) ?? null;

    const nextRound = currentRound ?? nextPendingRound;

    const currentSchedule =
      currentRound?.assignment.schedule ??
      nextPendingRound?.assignment.schedule ??
      todayRounds[0]?.assignment.schedule ??
      null;

    const monthlyRounds = await this.prisma.patrolRound.findMany({
      where: {
        assignment: {
          userId,
          status: 'ACTIVE',
          schedule: {
            siteId,
          },
        },
        scheduledStartAt: {
          gte: startOfMonth,
          lt: startOfNextMonth,
        },
        status: {
          not: 'CANCELLED',
        },
      },
      select: {
        status: true,
      },
    });

    const totalMonthlyRounds = monthlyRounds.length;

    const completedMonthlyRounds = monthlyRounds.filter(
      (round) => round.status === 'COMPLETED',
    ).length;

    const performanceScore =
      totalMonthlyRounds === 0
        ? null
        : Math.round((completedMonthlyRounds / totalMonthlyRounds) * 100);

    const performanceLabel =
      performanceScore === null
        ? 'Belum Ada Data'
        : performanceScore >= 90
          ? 'Sangat Baik'
          : performanceScore >= 75
            ? 'Baik'
            : 'Perlu Peningkatan';

    if (todayRounds.length === 0) {
      return {
        status: 'NO_SHIFT_TODAY',
        data: {
          user,
          site,
          shift: null,
          progress: {
            percentage: 0,
            completed: 0,
            missed: 0,
            total: 0,
          },
          nextPatrol: null,
          performance: {
            monthlyScore: performanceScore,
            label: performanceLabel,
          },
        },
      };
    }

    return {
      status: 'SUCCESS',
      data: {
        user,
        site,
        shift: currentSchedule
          ? {
              scheduleName: currentSchedule.name,
              startTime: currentSchedule.startTime,
              endTime: currentSchedule.endTime,
              intervalMinutes: currentSchedule.intervalMinutes,
            }
          : null,
        progress: {
          percentage: progressPercentage,
          completed: completedCheckpoints,
          missed: missedCheckpoints,
          total: totalCheckpoints,
        },
        nextPatrol: nextRound
          ? {
              roundId: nextRound.id,
              roundNumber: nextRound.roundNumber,
              scheduledStartAt: this.toWitaISOString(
                nextRound.scheduledStartAt,
              ),
              scheduledEndAt: this.toWitaISOString(nextRound.scheduledEndAt),
              status: nextRound.status,
              remainingCheckpoints: this.getRemainingCheckpoints(
                nextRound.checkpoints,
              ),
            }
          : null,
        performance: {
          monthlyScore: performanceScore,
          label: performanceLabel,
        },
      },
    };
  }

  async getAdminDashboard(
    siteId: string,
    startDate: Date,
    endDate: Date,
    scheduleId?: string,
  ) {
    const scheduleFilter = scheduleId ? { id: scheduleId } : {};

    const patrolScheduleFilter = scheduleId
      ? {
          scheduleAssignment: {
            scheduleId,
          },
        }
      : {};

    const findingScheduleFilter = scheduleId
      ? {
          patrol: {
            scheduleAssignment: {
              scheduleId,
            },
          },
        }
      : {};

    const [
      activeOfficersCount,
      checkpointsStat,
      outOfRadiusCount,
      recentPatrols,
      criticalFindings,
    ] = await Promise.all([
      this.prisma.patrolScheduleAssignment.count({
        where: {
          schedule: {
            siteId,
            ...scheduleFilter,
          },
          startDate: {
            lte: endDate,
          },
          OR: [{ endDate: null }, { endDate: { gte: startDate } }],
          status: 'ACTIVE',
        },
      }),

      this.prisma.patrolCheckpoint.groupBy({
        by: ['status'],
        where: {
          round: {
            scheduleDate: {
              date: {
                gte: startDate,
                lt: endDate,
              },
            },
            assignment: {
              schedule: {
                siteId,
                ...scheduleFilter,
              },
            },
          },
        },
        _count: {
          id: true,
        },
      }),

      this.prisma.patrol.count({
        where: {
          siteId,
          startedAt: {
            gte: startDate,
            lt: endDate,
          },
          ...patrolScheduleFilter,
          OR: [{ gpsValidationStatus: 'INVALID' }, { status: 'FAILED' }],
        },
      }),

      this.prisma.patrol.findMany({
        where: {
          siteId,
          startedAt: {
            gte: startDate,
            lt: endDate,
          },
          ...patrolScheduleFilter,
        },
        orderBy: {
          startedAt: 'desc',
        },
        take: 6,
        include: {
          user: {
            select: {
              fullName: true,
            },
          },
          patrolPoint: {
            select: {
              name: true,
              code: true,
            },
          },
        },
      }),

      this.prisma.finding.findMany({
        where: {
          patrolPoint: {
            siteId,
          },
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
          status: 'OPEN',
          severity: {
            in: ['CRITICAL', 'HIGH', 'MEDIUM'],
          },
          ...findingScheduleFilter,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
        include: {
          reportedBy: {
            select: {
              fullName: true,
            },
          },
          patrolPoint: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const totalCheckpoints = checkpointsStat.reduce(
      (acc, curr) => acc + curr._count.id,
      0,
    );

    const completedCheckpoints =
      checkpointsStat.find((checkpoint) => checkpoint.status === 'COMPLETED')
        ?._count.id ?? 0;

    return {
      status: 'SUCCESS',
      data: {
        executiveSummary: {
          totalOfficers: activeOfficersCount,
          targetOfficers: 40,
          activeCheckpoints: totalCheckpoints,
          completedCheckpoints,
          outOfRadiusAlerts: outOfRadiusCount,
        },
        recentExecutions: recentPatrols.map((patrol) => ({
          id: patrol.id,
          guardName: patrol.user.fullName,
          checkpointNode: patrol.patrolPoint.name,
          nfcStatus: patrol.nfcValidationStatus,
          gpsStatus:
            patrol.gpsValidationStatus === 'VALID' ? 'On Site' : 'Off Site',
          timestamp: patrol.startedAt,
        })),
        criticalFindingsFeed: criticalFindings.map((finding) => ({
          id: finding.id,
          severity: finding.severity,
          title: finding.title,
          guardName: finding.reportedBy.fullName,
          location: finding.patrolPoint.name,
          timestamp: finding.createdAt,
          description: finding.description,
        })),
      },
    };
  }
}
