import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateScheduleAssignmentDto } from '../dto/create.schedule.assignment.dto.js';
import { PatrolSchedulePolicy } from '../policies/patrol.schedule.policy.service.js';

@Injectable()
export class PatrolScheduleAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PatrolSchedulePolicy,
  ) {}

  async create(
    scheduleId: string,
    dto: CreateScheduleAssignmentDto,
    createdById: string,
  ) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    this.policy.assertDraft(schedule.status);

    const user = await this.prisma.user.findUnique({
      where: {
        id: dto.userId,
      },
      include: {
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role.name !== 'SECURITY') {
      throw new BadRequestException('Only SECURITY users can be assigned');
    }

    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('User is not active');
    }

    if (user.siteId !== schedule.siteId) {
      throw new BadRequestException('User does not belong to schedule site');
    }

    const startDate = this.parseDate(dto.startDate);

    const endDate = dto.endDate ? this.parseDate(dto.endDate) : null;

    if (endDate && endDate < startDate) {
      throw new BadRequestException('End date cannot be before start date');
    }

    const overlapping = await this.findOverlappingAssignment(
      scheduleId,
      dto.userId,
      startDate,
      endDate,
    );

    if (overlapping) {
      throw new ConflictException('User already has overlapping assignment');
    }

    return this.prisma.patrolScheduleAssignment.create({
      data: {
        scheduleId,
        userId: dto.userId,
        startDate,
        endDate,
        createdById,
      },
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
    });
  }

  async findAll(scheduleId: string) {
    return this.prisma.patrolScheduleAssignment.findMany({
      where: {
        scheduleId,
      },
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
      orderBy: {
        startDate: 'asc',
      },
    });
  }

  async remove(scheduleId: string, id: string) {
    const assignment = await this.prisma.patrolScheduleAssignment.findFirst({
      where: {
        id,
        scheduleId,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const rounds = await this.prisma.patrolRound.count({
      where: {
        assignmentId: id,
      },
    });

    if (rounds > 0) {
      throw new ConflictException(
        'Assignment cannot be deleted because rounds already exist',
      );
    }

    await this.prisma.patrolScheduleAssignment.delete({
      where: {
        id,
      },
    });

    return {
      message: 'Schedule assignment deleted successfully',
    };
  }

  private async findOverlappingAssignment(
    scheduleId: string,
    userId: string,
    startDate: Date,
    endDate: Date | null,
  ) {
    return this.prisma.patrolScheduleAssignment.findFirst({
      where: {
        scheduleId,
        userId,
        status: 'ACTIVE',

        startDate: {
          lte: endDate ?? new Date('9999-12-31'),
        },

        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: startDate,
            },
          },
        ],
      },
    });
  }

  private parseDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }

    return date;
  }
}
