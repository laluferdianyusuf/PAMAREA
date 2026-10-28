import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../../audit/audit.service.js';
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
    private readonly auditLogService: AuditLogService,
  ) {}

  async add(scheduleId: string, dto: CreateSchedulePointDto, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.patrolSchedule.findUnique({
        where: { id: scheduleId },
      });

      if (!schedule) {
        throw new NotFoundException('Schedule not found');
      }

      this.policy.assertDraft(schedule.status);

      const point = await tx.patrolPoint.findUnique({
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

      const existing = await tx.patrolSchedulePoint.findUnique({
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

      const lastPoint = await tx.patrolSchedulePoint.findFirst({
        where: { scheduleId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });

      const created = await tx.patrolSchedulePoint.create({
        data: {
          scheduleId,
          patrolPointId: dto.patrolPointId,
          sequence: dto.sequence ?? (lastPoint?.sequence ?? 0) + 1,
          required: dto.required ?? true,
        },
        include: {
          patrolPoint: true,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: adminId,
        action: 'ADD_SCHEDULE_POINT',
        entityType: 'PatrolSchedulePoint',
        entityId: created.id,
        newData: {
          scheduleId,
          patrolPointId: created.patrolPointId,
          patrolPointCode: created.patrolPoint.code,
          patrolPointName: created.patrolPoint.name,
          sequence: created.sequence,
          required: created.required,
        },
      });

      return created;
    });
  }

  async addMany(
    scheduleId: string,
    dto: CreateManySchedulePointsDto,
    adminId: string,
  ) {
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

        const addedPoints = result.filter((item) =>
          newPointIds.includes(item.patrolPointId),
        );

        await this.auditLogService.createAudit(tx, {
          userId: adminId,
          action: 'ADD_SCHEDULE_POINTS',
          entityType: 'PatrolSchedule',
          entityId: scheduleId,
          newData: {
            addedCount: addedPoints.length,
            skippedCount: existingIds.size,
            points: addedPoints.map((item) => ({
              id: item.id,
              patrolPointId: item.patrolPointId,
              code: item.patrolPoint.code,
              name: item.patrolPoint.name,
              sequence: item.sequence,
              required: item.required,
            })),
          },
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
    adminId: string,
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

      const oldSequence = schedule.points
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map((item) => ({
          id: item.id,
          patrolPointId: item.patrolPointId,
          sequence: item.sequence,
        }));

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
        const originalSequence = item.sequence - 100000;
        const newSequence =
          originalSequence >= insertAtSequence
            ? originalSequence + 1
            : originalSequence;

        await tx.patrolSchedulePoint.update({
          where: { id: item.id },
          data: { sequence: newSequence },
        });
      }

      const created = await tx.patrolSchedulePoint.create({
        data: {
          scheduleId,
          patrolPointId,
          sequence: insertAtSequence,
          required,
        },
        include: {
          patrolPoint: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      const updatedPoints = await tx.patrolSchedulePoint.findMany({
        where: { scheduleId },
        orderBy: { sequence: 'asc' },
        select: {
          id: true,
          patrolPointId: true,
          sequence: true,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: adminId,
        action: 'INSERT_SCHEDULE_POINT',
        entityType: 'PatrolSchedule',
        entityId: scheduleId,
        oldData: {
          points: oldSequence,
        },
        newData: {
          insertedPoint: {
            id: created.id,
            patrolPointId: created.patrolPointId,
            code: created.patrolPoint.code,
            name: created.patrolPoint.name,
            sequence: created.sequence,
            required: created.required,
          },
          points: updatedPoints,
        },
      });

      return created;
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

  async update(
    scheduleId: string,
    id: string,
    dto: UpdateSchedulePointDto,
    adminId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.patrolSchedule.findUnique({
        where: { id: scheduleId },
      });

      if (!schedule) {
        throw new NotFoundException('Schedule not found');
      }

      this.policy.assertDraft(schedule.status);

      const point = await tx.patrolSchedulePoint.findFirst({
        where: {
          id,
          scheduleId,
        },
        include: {
          patrolPoint: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      if (!point) {
        throw new NotFoundException('Schedule point not found');
      }

      if (
        dto.sequence !== undefined &&
        (!Number.isInteger(dto.sequence) || dto.sequence < 1)
      ) {
        throw new BadRequestException('Sequence harus berupa angka positif');
      }

      if (dto.sequence !== undefined && dto.sequence !== point.sequence) {
        const conflictingSequence = await tx.patrolSchedulePoint.findFirst({
          where: {
            scheduleId,
            sequence: dto.sequence,
            id: { not: id },
          },
        });

        if (conflictingSequence) {
          throw new ConflictException(
            'Sequence sudah digunakan oleh patrol point lain',
          );
        }
      }

      const updated = await tx.patrolSchedulePoint.update({
        where: { id },
        data: {
          ...(dto.sequence !== undefined && {
            sequence: dto.sequence,
          }),
          ...(dto.required !== undefined && {
            required: dto.required,
          }),
        },
        include: {
          patrolPoint: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: adminId,
        action: 'UPDATE_SCHEDULE_POINT',
        entityType: 'PatrolSchedulePoint',
        entityId: id,
        oldData: {
          scheduleId: point.scheduleId,
          patrolPointId: point.patrolPointId,
          patrolPointCode: point.patrolPoint.code,
          patrolPointName: point.patrolPoint.name,
          sequence: point.sequence,
          required: point.required,
        },
        newData: {
          scheduleId: updated.scheduleId,
          patrolPointId: updated.patrolPointId,
          patrolPointCode: updated.patrolPoint.code,
          patrolPointName: updated.patrolPoint.name,
          sequence: updated.sequence,
          required: updated.required,
        },
      });

      return updated;
    });
  }

  async remove(scheduleId: string, id: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.patrolSchedule.findUnique({
        where: { id: scheduleId },
      });

      if (!schedule) {
        throw new NotFoundException('Schedule not found');
      }

      this.policy.assertDraft(schedule.status);

      const point = await tx.patrolSchedulePoint.findFirst({
        where: {
          id,
          scheduleId,
        },
        include: {
          patrolPoint: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      if (!point) {
        throw new NotFoundException('Schedule point not found');
      }

      await this.auditLogService.createAudit(tx, {
        userId: adminId,
        action: 'REMOVE_SCHEDULE_POINT',
        entityType: 'PatrolSchedulePoint',
        entityId: id,
        oldData: {
          scheduleId: point.scheduleId,
          patrolPointId: point.patrolPointId,
          patrolPointCode: point.patrolPoint.code,
          patrolPointName: point.patrolPoint.name,
          sequence: point.sequence,
          required: point.required,
        },
      });

      await tx.patrolSchedulePoint.delete({
        where: { id },
      });

      return {
        message: 'Schedule point removed successfully',
      };
    });
  }
}
