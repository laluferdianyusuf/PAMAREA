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
import { ScheduleGenerationService } from './schedule.generation.service.js';

@Injectable()
export class PatrolSchedulePointService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PatrolSchedulePolicy,
    private readonly generationService: ScheduleGenerationService,
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
    if (!dto.patrolPointIds?.length) {
      throw new BadRequestException('Pilih minimal satu patrol point');
    }

    const uniquePointIds = [...new Set(dto.patrolPointIds)];

    if (uniquePointIds.length !== dto.patrolPointIds.length) {
      throw new ConflictException(
        'Patrol point tidak boleh duplikat dalam request',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const schedule = await tx.patrolSchedule.findUnique({
          where: { id: scheduleId },
          select: {
            id: true,
            siteId: true,
            status: true,
          },
        });

        if (!schedule) {
          throw new NotFoundException('Schedule not found');
        }

        this.policy.assertDraft(schedule.status);

        const patrolPoints = await tx.patrolPoint.findMany({
          where: {
            id: { in: uniquePointIds },
          },
          select: {
            id: true,
            siteId: true,
            code: true,
            name: true,
            status: true,
          },
        });

        const foundIds = new Set(patrolPoints.map((point) => point.id));

        const missingIds = uniquePointIds.filter((id) => !foundIds.has(id));

        if (missingIds.length > 0) {
          throw new NotFoundException({
            message: 'Some patrol points were not found',
            invalidPointIds: missingIds,
          });
        }

        const invalidSitePoints = patrolPoints.filter(
          (point) => point.siteId !== schedule.siteId,
        );

        if (invalidSitePoints.length > 0) {
          throw new BadRequestException({
            message: 'Some patrol points belong to another site',
            invalidPointIds: invalidSitePoints.map((point) => point.id),
          });
        }

        const inactivePoints = patrolPoints.filter(
          (point) => point.status !== 'ACTIVE',
        );

        if (inactivePoints.length > 0) {
          throw new BadRequestException({
            message: 'Some patrol points are inactive',
            invalidPointIds: inactivePoints.map((point) => point.id),
          });
        }

        // Cari point yang sudah terpasang pada schedule.
        const existingPoints = await tx.patrolSchedulePoint.findMany({
          where: {
            scheduleId,
            patrolPointId: { in: uniquePointIds },
          },
          select: {
            patrolPointId: true,
          },
        });

        const existingIds = new Set(
          existingPoints.map((point) => point.patrolPointId),
        );

        const newPointIds = uniquePointIds.filter((id) => !existingIds.has(id));

        if (newPointIds.length === 0) {
          throw new ConflictException(
            'All selected patrol points already exist in this schedule',
          );
        }

        // Ambil sequence tertinggi agar titik baru ditambahkan di akhir.
        const lastPoint = await tx.patrolSchedulePoint.findFirst({
          where: { scheduleId },
          orderBy: { sequence: 'desc' },
          select: { sequence: true },
        });

        const startingSequence = (lastPoint?.sequence ?? 0) + 1;

        await tx.patrolSchedulePoint.createMany({
          data: newPointIds.map((patrolPointId, index) => ({
            scheduleId,
            patrolPointId,
            sequence: startingSequence + index,
            required: dto.required ?? true,
          })),
        });

        const result = await tx.patrolSchedulePoint.findMany({
          where: { scheduleId },
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
          orderBy: { sequence: 'asc' },
        });

        return {
          message: 'Patrol points added successfully',
          addedCount: newPointIds.length,
          skippedCount: existingIds.size,
          data: result,
        };
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  async addPoint(
    scheduleId: string,
    patrolPointId: string,
    insertAtSequence: number,
    required = true,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.patrolSchedule.findUnique({
        where: { id: scheduleId },
        include: { points: true },
      });

      if (!schedule) {
        throw new NotFoundException('Schedule tidak ditemukan');
      }

      if (schedule.status !== 'ACTIVE') {
        throw new ConflictException('Hanya schedule ACTIVE yang dapat diubah');
      }

      const point = await tx.patrolPoint.findFirst({
        where: {
          id: patrolPointId,
          siteId: schedule.siteId,
          status: 'ACTIVE',
        },
      });

      if (!point) {
        throw new BadRequestException(
          'Patrol point tidak valid atau berbeda Site',
        );
      }

      if (
        !Number.isInteger(insertAtSequence) ||
        insertAtSequence < 1 ||
        insertAtSequence > schedule.points.length + 1
      ) {
        throw new BadRequestException('Posisi point tidak valid');
      }

      const alreadyExists = schedule.points.some(
        (item) => item.patrolPointId === patrolPointId,
      );

      if (alreadyExists) {
        throw new ConflictException('Point sudah ada di schedule ini');
      }

      // Geser sequence ke rentang sementara agar tidak bentrok
      // dengan unique constraint scheduleId + sequence.
      await tx.patrolSchedulePoint.updateMany({
        where: { scheduleId },
        data: {
          sequence: { increment: 100000 },
        },
      });

      const existingPoints = await tx.patrolSchedulePoint.findMany({
        where: { scheduleId },
        orderBy: { sequence: 'asc' },
      });

      for (const item of existingPoints) {
        const newSequence =
          item.sequence - 100000 >= insertAtSequence
            ? item.sequence - 100000 + 1
            : item.sequence - 100000;

        await tx.patrolSchedulePoint.update({
          where: { id: item.id },
          data: { sequence: newSequence },
        });
      }

      return tx.patrolSchedulePoint.create({
        data: {
          scheduleId,
          patrolPointId,
          sequence: insertAtSequence,
          required,
        },
      });
    });

    const scheduleDates = await this.prisma.patrolScheduleDate.findMany({
      where: {
        scheduleId,
        status: { not: 'CANCELLED' },
      },
      select: { date: true },
      orderBy: { date: 'asc' },
    });

    for (const scheduleDate of scheduleDates) {
      const dateString = scheduleDate.date.toISOString().slice(0, 10);

      await this.generationService.generate(scheduleId, {
        startDate: dateString,
        endDate: dateString,
      });
    }

    return result;
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
