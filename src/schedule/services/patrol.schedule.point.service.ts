import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateManySchedulePointsDto,
  CreateSchedulePointDto,
} from '../dto/create.schedule.point.dto.js';
import { UpdateSchedulePointDto } from '../dto/update.schedule.point.dto.js';
import { PatrolSchedulePolicy } from '../policies/patrol.schedule.policy.service.js';

@Injectable()
export class PatrolSchedulePointService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PatrolSchedulePolicy,
  ) {}

  async add(scheduleId: string, dto: CreateSchedulePointDto) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    this.policy.assertDraft(schedule.status);

    const point = await this.prisma.patrolPoint.findUnique({
      where: {
        id: dto.patrolPointId,
      },
    });

    if (!point) {
      throw new NotFoundException('Patrol point not found');
    }

    if (point.siteId !== schedule.siteId) {
      throw new BadRequestException('Patrol point belongs to another site');
    }

    const existing = await this.prisma.patrolSchedulePoint.findUnique({
      where: {
        scheduleId_patrolPointId: {
          scheduleId,
          patrolPointId: dto.patrolPointId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Patrol point already exists in this schedule',
      );
    }

    return this.prisma.patrolSchedulePoint.create({
      data: {
        scheduleId,
        patrolPointId: dto.patrolPointId,
        sequence: dto.sequence ?? 1,
        required: dto.required ?? true,
      },
      include: {
        patrolPoint: true,
      },
    });
  }

  async addMany(scheduleId: string, dto: CreateManySchedulePointsDto) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: {
        id: scheduleId,
      },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    this.policy.assertDraft(schedule.status);

    // Remove duplicate point IDs
    const patrolPointIds = [...new Set(dto.patrolPointIds)];

    // Get all patrol points
    const patrolPoints = await this.prisma.patrolPoint.findMany({
      where: {
        id: {
          in: patrolPointIds,
        },
      },
      select: {
        id: true,
        siteId: true,
        code: true,
        name: true,
        status: true,
      },
    });

    // Check whether all points exist
    const foundIds = new Set(patrolPoints.map((point) => point.id));

    const missingIds = patrolPointIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      throw new NotFoundException(
        `Some patrol points were not found: ${missingIds.join(', ')}`,
      );
    }

    // Make sure every point belongs
    // to the same site as the schedule
    const invalidSitePoints = patrolPoints.filter(
      (point) => point.siteId !== schedule.siteId,
    );

    if (invalidSitePoints.length > 0) {
      throw new BadRequestException(
        `Some patrol points do not belong to schedule site`,
      );
    }

    // Optional: only ACTIVE patrol points
    const inactivePoints = patrolPoints.filter(
      (point) => point.status !== 'ACTIVE',
    );

    if (inactivePoints.length > 0) {
      throw new BadRequestException(`Some patrol points are not active`);
    }

    // Check existing schedule points
    const existingPoints = await this.prisma.patrolSchedulePoint.findMany({
      where: {
        scheduleId,

        patrolPointId: {
          in: patrolPointIds,
        },
      },
      select: {
        patrolPointId: true,
      },
    });

    const existingIds = new Set(
      existingPoints.map((point) => point.patrolPointId),
    );

    const newPointIds = patrolPointIds.filter((id) => !existingIds.has(id));

    if (newPointIds.length === 0) {
      throw new ConflictException(
        'All selected patrol points already exist in this schedule',
      );
    }

    // Get current maximum sequence
    const lastPoint = await this.prisma.patrolSchedulePoint.findFirst({
      where: {
        scheduleId,
      },
      orderBy: {
        sequence: 'desc',
      },
      select: {
        sequence: true,
      },
    });

    const startingSequence = (lastPoint?.sequence ?? 0) + 1;

    // Create everything atomically
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.patrolSchedulePoint.createMany({
        data: newPointIds.map((patrolPointId, index) => ({
          scheduleId,
          patrolPointId,

          sequence: startingSequence + index,

          required: dto.required ?? true,
        })),
      });

      return tx.patrolSchedulePoint.findMany({
        where: {
          scheduleId,
        },
        include: {
          patrolPoint: {
            select: {
              id: true,
              code: true,
              name: true,
              latitude: true,
              longitude: true,
              radiusMeters: true,
              status: true,
            },
          },
        },
        orderBy: {
          sequence: 'asc',
        },
      });
    });

    return {
      message: 'Patrol points added successfully',

      addedCount: newPointIds.length,

      skippedCount: existingIds.size,

      data: result,
    };
  }

  async findAll(scheduleId: string) {
    return this.prisma.patrolSchedulePoint.findMany({
      where: {
        scheduleId,
      },
      include: {
        patrolPoint: true,
      },
      orderBy: {
        sequence: 'asc',
      },
    });
  }

  async update(scheduleId: string, id: string, dto: UpdateSchedulePointDto) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    this.policy.assertDraft(schedule.status);

    const point = await this.prisma.patrolSchedulePoint.findFirst({
      where: {
        id,
        scheduleId,
      },
    });

    if (!point) {
      throw new NotFoundException('Schedule point not found');
    }

    return this.prisma.patrolSchedulePoint.update({
      where: { id },
      data: {
        ...(dto.sequence !== undefined && {
          sequence: dto.sequence,
        }),
        ...(dto.required !== undefined && {
          required: dto.required,
        }),
      },
    });
  }

  async remove(scheduleId: string, id: string) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    this.policy.assertDraft(schedule.status);

    const point = await this.prisma.patrolSchedulePoint.findFirst({
      where: {
        id,
        scheduleId,
      },
    });

    if (!point) {
      throw new NotFoundException('Schedule point not found');
    }

    await this.prisma.patrolSchedulePoint.delete({
      where: { id },
    });

    return {
      message: 'Schedule point removed successfully',
    };
  }
}
