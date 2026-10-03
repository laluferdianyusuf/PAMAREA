import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class PatrolScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.patrolSchedule.findUnique({
      where: { id },
      include: {
        site: true,
        points: {
          include: {
            patrolPoint: true,
          },
          orderBy: {
            sequence: 'asc',
          },
        },
        dates: {
          orderBy: {
            date: 'asc',
          },
        },
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                employeeNumber: true,
                fullName: true,
                username: true,
              },
            },
          },
        },
      },
    });
  }

  findBasicById(id: string) {
    return this.prisma.patrolSchedule.findUnique({
      where: { id },
    });
  }
}
