import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // MOBILE DASHBOARD (Untuk Satpam)
  async getMobileDashboard(userId: string, siteId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Ambil Shift & Round Hari Ini untuk user tersebut
    const todayRounds = await this.prisma.patrolRound.findMany({
      where: {
        assignment: { userId: userId, status: 'ACTIVE' },
        scheduleDate: { date: today },
      },
      include: {
        assignment: { include: { schedule: true } },
        checkpoints: true,
      },
      orderBy: { scheduledStartAt: 'asc' },
    });

    if (!todayRounds || todayRounds.length === 0) {
      return { status: 'NO_SHIFT_TODAY', data: null };
    }

    const currentSchedule = todayRounds[0].assignment.schedule;

    // 2. Kalkulasi Progress & Checkpoints
    let totalCheckpoints = 0;
    let completedCheckpoints = 0;
    let missedCheckpoints = 0;

    todayRounds.forEach((round) => {
      totalCheckpoints += round.checkpoints.length;
      completedCheckpoints += round.checkpoints.filter(
        (c) => c.status === 'COMPLETED',
      ).length;
      missedCheckpoints += round.checkpoints.filter(
        (c) => c.status === 'MISSED' || c.status === 'FAILED',
      ).length;
    });

    const progressPercentage =
      totalCheckpoints === 0
        ? 0
        : Math.round((completedCheckpoints / totalCheckpoints) * 100);

    // 3. Tentukan Next Patrol (Round yang belum selesai/sedang berjalan)
    const nextRound = todayRounds.find(
      (r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS',
    );

    // 4. Kinerja Bulan Ini (Performance)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyRounds = await this.prisma.patrolRound.findMany({
      where: {
        assignment: { userId: userId },
        scheduledStartAt: { gte: startOfMonth },
      },
      select: { status: true },
    });

    const totalMonthlyRounds = monthlyRounds.length;
    const completedMonthlyRounds = monthlyRounds.filter(
      (r) => r.status === 'COMPLETED',
    ).length;
    const performanceScore =
      totalMonthlyRounds === 0
        ? 100
        : Math.round((completedMonthlyRounds / totalMonthlyRounds) * 100);

    return {
      status: 'SUCCESS',
      data: {
        shift: {
          scheduleName: currentSchedule.name,
          startTime: currentSchedule.startTime,
          endTime: currentSchedule.endTime,
          intervalMinutes: currentSchedule.intervalMinutes,
        },
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
              scheduledStartAt: nextRound.scheduledStartAt,
              scheduledEndAt: nextRound.scheduledEndAt,
              status: nextRound.status,
              remainingCheckpoints: nextRound.checkpoints.filter(
                (c) => c.status === 'PENDING',
              ).length,
            }
          : null,
        performance: {
          monthlyScore: performanceScore,
          label:
            performanceScore >= 90
              ? 'Sangat Baik'
              : performanceScore >= 75
                ? 'Baik'
                : 'Perlu Peningkatan',
        },
      },
    };
  }

  // ADMIN DASHBOARD (Untuk Command Center / Web)
  async getAdminDashboard(
    siteId: string,
    startDate: Date,
    endDate: Date,
    scheduleId?: string,
  ) {
    // 1. Buat Filter Dinamis (Conditional Where)
    // Jika scheduleId dikirim, tambahkan ke dalam filter. Jika tidak, abaikan.

    const scheduleFilter = scheduleId ? { id: scheduleId } : {};
    const patrolScheduleFilter = scheduleId
      ? { scheduleAssignment: { scheduleId: scheduleId } }
      : {};
    const findingScheduleFilter = scheduleId
      ? { patrol: { scheduleAssignment: { scheduleId: scheduleId } } }
      : {};

    // Mulai Eksekusi Query Secara Paralel
    const [
      activeOfficersCount,
      checkpointsStat,
      outOfRadiusCount,
      recentPatrols,
      criticalFindings,
    ] = await Promise.all([
      // 1. Total Patrol Officers berdasarkan Site, Periode, dan Shift (Schedule)
      this.prisma.patrolScheduleAssignment.count({
        where: {
          schedule: { siteId: siteId, ...scheduleFilter },
          startDate: { lte: endDate },
          OR: [{ endDate: null }, { endDate: { gte: startDate } }],
          status: 'ACTIVE',
        },
      }),

      // 2. Active Patrol Checkpoints (berdasarkan scheduleDate di dalam periode)
      this.prisma.patrolCheckpoint.groupBy({
        by: ['status'],
        where: {
          round: {
            scheduleDate: { date: { gte: startDate, lt: endDate } },
            assignment: { schedule: { siteId: siteId, ...scheduleFilter } },
          },
        },
        _count: { id: true },
      }),

      // 3. Out-Of-Radius / Alerts (Insiden dalam periode & shift tertentu)
      this.prisma.patrol.count({
        where: {
          siteId: siteId,
          startedAt: { gte: startDate, lt: endDate },
          ...patrolScheduleFilter,
          OR: [{ gpsValidationStatus: 'INVALID' }, { status: 'FAILED' }],
        },
      }),

      // 4. Recent Patrol Executions (berdasarkan periode & shift)
      this.prisma.patrol.findMany({
        where: {
          siteId: siteId,
          startedAt: { gte: startDate, lt: endDate },
          ...patrolScheduleFilter,
        },
        orderBy: { startedAt: 'desc' },
        take: 6,
        include: {
          user: { select: { fullName: true } },
          patrolPoint: { select: { name: true, code: true } },
        },
      }),

      // 5. Critical Findings Feed (berdasarkan periode & shift)
      this.prisma.finding.findMany({
        where: {
          patrolPoint: { siteId: siteId },
          createdAt: { gte: startDate, lt: endDate },
          status: 'OPEN',
          severity: { in: ['CRITICAL', 'HIGH', 'MEDIUM'] },
          ...findingScheduleFilter,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          reportedBy: { select: { fullName: true } },
          patrolPoint: { select: { name: true } },
        },
      }),
    ]);

    // Kalkulasi summary dari GroupBy
    const totalCheckpoints = checkpointsStat.reduce(
      (acc, curr) => acc + curr._count.id,
      0,
    );
    const completedCheckpoints =
      checkpointsStat.find((c) => c.status === 'COMPLETED')?._count.id || 0;

    return {
      status: 'SUCCESS',
      data: {
        executiveSummary: {
          totalOfficers: activeOfficersCount,
          targetOfficers: 40,
          activeCheckpoints: totalCheckpoints,
          completedCheckpoints: completedCheckpoints,
          outOfRadiusAlerts: outOfRadiusCount,
        },
        recentExecutions: recentPatrols.map((p) => ({
          id: p.id,
          guardName: p.user.fullName,
          checkpointNode: p.patrolPoint.name,
          nfcStatus: p.nfcValidationStatus,
          gpsStatus: p.gpsValidationStatus === 'VALID' ? 'On Site' : 'Off Site',
          timestamp: p.startedAt,
        })),
        criticalFindingsFeed: criticalFindings.map((f) => ({
          id: f.id,
          severity: f.severity,
          title: f.title,
          guardName: f.reportedBy.fullName,
          location: f.patrolPoint.name,
          timestamp: f.createdAt,
          description: f.description,
        })),
      },
    };
  }
}
