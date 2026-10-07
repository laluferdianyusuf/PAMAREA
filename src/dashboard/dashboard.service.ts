import { Injectable, NotFoundException } from '@nestjs/common';

import { DashboardRepository } from './dashboard.repository.js';

@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async getMyDashboard(userId: string) {
    const user = await this.repository.findUser(userId);

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const checkpoints = await this.repository.findTodayCheckpoints(
      userId,
      startOfDay,
      endOfDay,
    );

    const totalPatrol = checkpoints.length;

    const completedPatrol = checkpoints.filter(
      (checkpoint) => checkpoint.status === 'COMPLETED',
    ).length;

    const pendingPatrol = checkpoints.filter(
      (checkpoint) =>
        checkpoint.status === 'PENDING' || checkpoint.status === 'IN_PROGRESS',
    ).length;

    const completionPercentage =
      totalPatrol === 0 ? 0 : Math.round((completedPatrol / totalPatrol) * 100);

    const nextPatrol =
      checkpoints.find(
        (checkpoint) =>
          checkpoint.status === 'PENDING' ||
          checkpoint.status === 'IN_PROGRESS',
      ) ?? null;

    const scheduleCompliance = this.calculateScheduleCompliance(checkpoints);

    const reportCompletion = this.calculateReportCompletion(checkpoints);

    const performance = this.calculatePerformance({
      completionPercentage,
      scheduleCompliance,
      reportCompletion,
    });

    return {
      user: {
        id: user.id,
        name: user.fullName,
      },

      today: {
        date: this.formatDate(now),

        completedPatrol,
        totalPatrol,
        pendingPatrol,

        completionPercentage,

        performance,

        scheduleCompliance,

        reportCompletion,
      },

      nextPatrol: nextPatrol
        ? {
            id: nextPatrol.id,

            patrolPointId: nextPatrol.patrolPoint.id,

            patrolPointName: nextPatrol.patrolPoint.name,

            siteName: nextPatrol.round.assignment.schedule.site.name,

            scheduledStartAt: nextPatrol.round.scheduledStartAt.toISOString(),

            scheduledEndAt: nextPatrol.round.scheduledEndAt.toISOString(),

            status: nextPatrol.status,
          }
        : null,
    };
  }

  private calculateScheduleCompliance(checkpoints: any[]): number {
    const completed = checkpoints.filter(
      (checkpoint) => checkpoint.status === 'COMPLETED',
    );

    if (completed.length === 0) {
      return 0;
    }

    const onTime = completed.filter((checkpoint) => {
      const completedAt = checkpoint.patrol?.completedAt;

      if (!completedAt) {
        return false;
      }

      return completedAt <= checkpoint.round.scheduledEndAt;
    }).length;

    return Math.round((onTime / completed.length) * 100);
  }

  private calculateReportCompletion(checkpoints: any[]): number {
    const completed = checkpoints.filter(
      (checkpoint) => checkpoint.status === 'COMPLETED',
    );

    if (completed.length === 0) {
      return 0;
    }

    const submitted = completed.filter(
      (checkpoint) => checkpoint.patrol?.status === 'SUBMITTED',
    ).length;

    return Math.round((submitted / completed.length) * 100);
  }

  private calculatePerformance(data: {
    completionPercentage: number;
    scheduleCompliance: number;
    reportCompletion: number;
  }): number {
    return Math.round(
      (data.completionPercentage +
        data.scheduleCompliance +
        data.reportCompletion) /
        3,
    );
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
