import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUser(userId: string) {
    return this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        fullName: true,
      },
    });
  }

  async findTodayCheckpoints(userId: string, startOfDay: Date, endOfDay: Date) {
    return this.prisma.patrolCheckpoint.findMany({
      where: {
        round: {
          scheduleDate: {
            date: {
              gte: startOfDay,
              lt: endOfDay,
            },
          },

          assignment: {
            userId,
            status: 'ACTIVE',
          },
        },

        required: true,

        status: {
          not: 'CANCELLED',
        },
      },

      select: {
        id: true,
        status: true,
        sequence: true,

        round: {
          select: {
            id: true,
            roundNumber: true,
            scheduledStartAt: true,
            scheduledEndAt: true,

            assignment: {
              select: {
                schedule: {
                  select: {
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
          },
        },

        patrolPoint: {
          select: {
            id: true,
            name: true,
          },
        },

        patrols: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },

      orderBy: {
        round: {
          scheduledStartAt: 'asc',
        },
      },
    });
  }
}
