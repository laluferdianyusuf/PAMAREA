import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../../audit/audit.service.js';
import {
  PatrolPointStatus,
  Prisma,
  RoleName,
  ScheduleAssignmentStatus,
  ScheduleDateStatus,
  ScheduleStatus,
  UserStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreatePatrolScheduleDto } from '../dto/create.schedule.dto.js';
import { ScheduleFilterDto } from '../dto/schedule.filter.dto.js';
import { UpdatePatrolScheduleDto } from '../dto/update.schedule.dto.js';
import { PatrolSchedulePolicy } from '../policies/patrol.schedule.policy.service.js';
import { PatrolScheduleRepository } from '../repositories/patrol-schedule.repository.js';
import { ScheduleGenerationService } from './schedule.generation.service.js';

type Tx = Prisma.TransactionClient;

@Injectable()
export class PatrolScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PatrolScheduleRepository,
    private readonly policy: PatrolSchedulePolicy,
    private readonly generationService: ScheduleGenerationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreatePatrolScheduleDto, createdById: string) {
    this.validateTimeRange(dto.startTime, dto.endTime);

    const points = dto.points ?? [];
    const dates = dto.dates ?? [];
    const assignments = dto.assignments ?? [];

    const pointIds = points.map((point) => point.patrolPointId);
    const uniquePointIds = [...new Set(pointIds)];

    if (uniquePointIds.length !== pointIds.length) {
      throw new ConflictException('Patrol point tidak boleh duplikat');
    }

    const userIds = assignments.map((assignment) => assignment.userId);
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length !== userIds.length) {
      throw new ConflictException('User assignment tidak boleh duplikat');
    }

    if (dates.length > 0) {
      this.validateDates(dates);

      for (const date of dates) {
        this.parseDateOnly(date);
      }
    }

    if (assignments.length > 0) {
      this.validateAssignments({
        ...dto,
        points,
        dates,
        assignments,
      } as CreatePatrolScheduleDto);

      for (const assignment of assignments) {
        const startDate = this.parseDateOnly(assignment.startDate);
        const endDate = assignment.endDate
          ? this.parseDateOnly(assignment.endDate)
          : null;

        if (endDate && endDate < startDate) {
          throw new BadRequestException(
            `Tanggal selesai assignment tidak boleh sebelum tanggal mulai: ${assignment.userId}`,
          );
        }
      }
    }

    if (uniqueUserIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: uniqueUserIds },
          status: UserStatus.ACTIVE,
          role: {
            name: RoleName.SECURITY,
          },
        },
        select: {
          id: true,
          fullName: true,
          role: {
            select: {
              name: true,
            },
          },
        },
      });

      if (users.length !== uniqueUserIds.length) {
        const foundIds = new Set(users.map((user) => user.id));
        const invalidUserIds = uniqueUserIds.filter((id) => !foundIds.has(id));

        throw new BadRequestException({
          message: 'Beberapa user assignment tidak valid',
          invalidUserIds,
        });
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        const site = await tx.site.findFirst({
          where: {
            id: dto.siteId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
          },
        });

        if (!site) {
          throw new NotFoundException('Site tidak ditemukan atau tidak aktif');
        }

        const existingSchedules = await tx.patrolSchedule.findMany({
          where: {
            siteId: dto.siteId,
            status: {
              not: ScheduleStatus.ARCHIVED,
            },
          },
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            status: true,
          },
        });

        const normalizedName = dto.name.trim().toLowerCase();

        const duplicateName = existingSchedules.find(
          (schedule) => schedule.name.trim().toLowerCase() === normalizedName,
        );

        if (duplicateName) {
          throw new ConflictException({
            message: 'Nama schedule sudah digunakan pada site ini',
            existingSchedule: {
              id: duplicateName.id,
              name: duplicateName.name,
            },
          });
        }

        const newStart = this.timeToMinutes(dto.startTime);
        const newEnd = this.timeToMinutes(dto.endTime);

        const conflictingSchedule = existingSchedules.find((schedule) =>
          this.timeRangesOverlap(
            newStart,
            newEnd,
            this.timeToMinutes(schedule.startTime),
            this.timeToMinutes(schedule.endTime),
          ),
        );

        if (conflictingSchedule) {
          throw new ConflictException({
            message: 'Jam schedule bentrok dengan schedule yang sudah ada',
            existingSchedule: {
              id: conflictingSchedule.id,
              name: conflictingSchedule.name,
              startTime: conflictingSchedule.startTime,
              endTime: conflictingSchedule.endTime,
              status: conflictingSchedule.status,
            },
          });
        }

        if (uniquePointIds.length > 0) {
          const patrolPoints = await tx.patrolPoint.findMany({
            where: {
              id: {
                in: uniquePointIds,
              },
              siteId: dto.siteId,
              status: PatrolPointStatus.ACTIVE,
            },
            select: {
              id: true,
            },
          });

          if (patrolPoints.length !== uniquePointIds.length) {
            const foundIds = new Set(patrolPoints.map((point) => point.id));

            const invalidPointIds = uniquePointIds.filter(
              (id) => !foundIds.has(id),
            );

            throw new BadRequestException({
              message: 'Beberapa patrol point tidak valid',
              invalidPointIds,
            });
          }
        }

        const schedule = await tx.patrolSchedule.create({
          data: {
            siteId: dto.siteId,
            name: dto.name.trim(),
            startTime: dto.startTime,
            endTime: dto.endTime,
            intervalMinutes: dto.intervalMinutes,
            gracePeriodMinutes: dto.gracePeriodMinutes ?? 30,
            enforceSequence: dto.enforceSequence ?? false,
            status: ScheduleStatus.DRAFT,
            createdById,
          },
        });

        if (points.length > 0) {
          await tx.patrolSchedulePoint.createMany({
            data: points.map((point, index) => ({
              scheduleId: schedule.id,
              patrolPointId: point.patrolPointId,
              sequence: index + 1,
              required: point.required ?? true,
            })),
          });
        }

        if (dates.length > 0) {
          await tx.patrolScheduleDate.createMany({
            data: dates.map((date) => ({
              scheduleId: schedule.id,
              date: this.parseDateOnly(date),
              status: ScheduleDateStatus.SCHEDULED,
              createdById,
            })),
          });
        }

        if (assignments.length > 0) {
          await tx.patrolScheduleAssignment.createMany({
            data: assignments.map((assignment) => ({
              scheduleId: schedule.id,
              userId: assignment.userId,
              startDate: this.parseDateOnly(assignment.startDate),
              endDate: assignment.endDate
                ? this.parseDateOnly(assignment.endDate)
                : null,
              status: ScheduleAssignmentStatus.ACTIVE,
              createdById,
            })),
          });
        }

        const result = await tx.patrolSchedule.findUniqueOrThrow({
          where: {
            id: schedule.id,
          },
          include: {
            site: true,
            points: {
              orderBy: {
                sequence: 'asc',
              },
              include: {
                patrolPoint: true,
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
              orderBy: {
                startDate: 'asc',
              },
            },
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId: createdById,
          action: 'CREATE',
          entityType: 'PatrolSchedule',
          entityId: schedule.id,
          newData: {
            siteId: schedule.siteId,
            name: schedule.name,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            intervalMinutes: schedule.intervalMinutes,
            gracePeriodMinutes: schedule.gracePeriodMinutes,
            enforceSequence: schedule.enforceSequence,
            status: schedule.status,
            patrolPointIds: uniquePointIds,
            dates,
            assignments: assignments.map((assignment) => ({
              userId: assignment.userId,
              startDate: assignment.startDate,
              endDate: assignment.endDate ?? null,
            })),
          },
        });

        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async findOne(id: string) {
    const schedule = await this.repository.findById(id);

    if (!schedule) {
      throw new NotFoundException('Patrol schedule not found');
    }

    return schedule;
  }

  async findAll(query: ScheduleFilterDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const where = {
      ...(query.siteId && { siteId: query.siteId }),
      ...(query.status && {
        status: query.status as ScheduleStatus,
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.patrolSchedule.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          site: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          _count: {
            select: {
              points: true,
              dates: true,
              assignments: true,
            },
          },
        },
      }),
      this.prisma.patrolSchedule.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMonthlyRoster(siteId: string, month: number, year: number) {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0));

    const assignments = await this.prisma.patrolScheduleAssignment.findMany({
      where: {
        schedule: { siteId },
        status: ScheduleAssignmentStatus.ACTIVE,
        startDate: { lte: endDate },
        OR: [{ endDate: null }, { endDate: { gte: startDate } }],
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
          },
        },
        schedule: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
          },
        },
      },
      orderBy: [{ user: { fullName: 'asc' } }, { startDate: 'asc' }],
    });

    const rosterMap = new Map<string, any>();

    for (const assign of assignments) {
      const userId = assign.user.id;

      if (!rosterMap.has(userId)) {
        rosterMap.set(userId, {
          userId,
          employeeNumber: assign.user.employeeNumber,
          fullName: assign.user.fullName,
          shifts: {},
          shiftDetails: {},
        });
      }

      const userData = rosterMap.get(userId);
      const scheduleName = assign.schedule.name.toLowerCase();

      let shiftCode: string;

      if (scheduleName.includes('pagi')) {
        shiftCode = 'P';
      } else if (
        scheduleName.includes('siang') ||
        scheduleName.includes('sore')
      ) {
        shiftCode = 'S';
      } else if (
        scheduleName.includes('malam') ||
        scheduleName.includes('overnight')
      ) {
        shiftCode = 'M';
      } else {
        shiftCode = '-';
      }

      const assignStart =
        assign.startDate > startDate ? assign.startDate : startDate;

      const assignEnd =
        assign.endDate && assign.endDate < endDate ? assign.endDate : endDate;

      const cursor = new Date(
        Date.UTC(
          assignStart.getUTCFullYear(),
          assignStart.getUTCMonth(),
          assignStart.getUTCDate(),
        ),
      );

      const lastDate = Date.UTC(
        assignEnd.getUTCFullYear(),
        assignEnd.getUTCMonth(),
        assignEnd.getUTCDate(),
      );

      while (cursor.getTime() <= lastDate) {
        const dateString = cursor.toISOString().slice(0, 10);

        if (userData.shifts[dateString]) {
          console.warn(
            `[Roster] Assignment ganda: ${assign.user.fullName}, ` +
              `${dateString}, shift sebelumnya=${userData.shifts[dateString]}, ` +
              `shift baru=${shiftCode}, jadwal=${assign.schedule.name}`,
          );
        } else {
          userData.shifts[dateString] = shiftCode;
        }

        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    const absences = await this.prisma.securityAbsence.findMany({
      where: {
        siteId,
        status: 'ACTIVE',
        startDate: {
          lte: endDate,
        },
        endDate: {
          gte: startDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
          },
        },
        replacements: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            replacementUser: {
              select: {
                id: true,
                fullName: true,
                employeeNumber: true,
              },
            },
            originalAssignment: {
              include: {
                schedule: {
                  select: {
                    name: true,
                    startTime: true,
                    endTime: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    for (const absence of absences) {
      const originalUserId = absence.user.id;

      if (!rosterMap.has(originalUserId)) {
        rosterMap.set(originalUserId, {
          userId: originalUserId,
          employeeNumber: absence.user.employeeNumber,
          fullName: absence.user.fullName,
          shifts: {},
          shiftDetails: {},
        });
      }

      const originalUserData = rosterMap.get(originalUserId);

      const absenceStart =
        absence.startDate > startDate ? absence.startDate : startDate;

      const absenceEnd = absence.endDate < endDate ? absence.endDate : endDate;

      const cursor = new Date(
        Date.UTC(
          absenceStart.getUTCFullYear(),
          absenceStart.getUTCMonth(),
          absenceStart.getUTCDate(),
        ),
      );

      const lastDate = Date.UTC(
        absenceEnd.getUTCFullYear(),
        absenceEnd.getUTCMonth(),
        absenceEnd.getUTCDate(),
      );

      while (cursor.getTime() <= lastDate) {
        const dateString = cursor.toISOString().slice(0, 10);

        // C = Cuti/ketidakhadiran.
        // Jenis detail sebenarnya disimpan di shiftDetails.
        originalUserData.shifts[dateString] = 'C';

        originalUserData.shiftDetails[dateString] = {
          type: absence.type,
          status: 'ABSENT',
          reason: absence.reason,
        };

        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      for (const replacement of absence.replacements) {
        const replacementUser = replacement.replacementUser;
        const replacementUserId = replacementUser.id;

        if (!rosterMap.has(replacementUserId)) {
          rosterMap.set(replacementUserId, {
            userId: replacementUserId,
            employeeNumber: replacementUser.employeeNumber,
            fullName: replacementUser.fullName,
            shifts: {},
            shiftDetails: {},
          });
        }

        const replacementUserData = rosterMap.get(replacementUserId);

        const replacementStart =
          replacement.startDate > startDate ? replacement.startDate : startDate;

        const replacementEnd =
          replacement.endDate < endDate ? replacement.endDate : endDate;

        const replacementCursor = new Date(
          Date.UTC(
            replacementStart.getUTCFullYear(),
            replacementStart.getUTCMonth(),
            replacementStart.getUTCDate(),
          ),
        );

        const replacementLastDate = Date.UTC(
          replacementEnd.getUTCFullYear(),
          replacementEnd.getUTCMonth(),
          replacementEnd.getUTCDate(),
        );

        while (replacementCursor.getTime() <= replacementLastDate) {
          const dateString = replacementCursor.toISOString().slice(0, 10);

          replacementUserData.shiftDetails[dateString] = {
            type: 'REPLACEMENT',
            status: 'REPLACEMENT',
            replacedUser: {
              id: absence.user.id,
              fullName: absence.user.fullName,
            },
            absenceType: absence.type,
            schedule: replacement.originalAssignment.schedule,
          };

          replacementCursor.setUTCDate(replacementCursor.getUTCDate() + 1);
        }
      }
    }

    return Array.from(rosterMap.values());
  }

  async update(id: string, dto: UpdatePatrolScheduleDto, adminId: string) {
    const schedule = await this.repository.findBasicById(id);

    if (!schedule) {
      throw new NotFoundException('Patrol schedule not found');
    }

    this.policy.assertEditable(schedule.status);

    const startTime = dto.startTime ?? schedule.startTime;
    const endTime = dto.endTime ?? schedule.endTime;

    this.validateTimeRange(startTime, endTime);

    return this.prisma.$transaction(
      async (tx) => {
        const existingSchedules = await tx.patrolSchedule.findMany({
          where: {
            siteId: schedule.siteId,
            id: { not: id },
            status: { not: ScheduleStatus.ARCHIVED },
          },
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
          },
        });

        const newName = (dto.name ?? schedule.name).trim().toLowerCase();

        const duplicateName = existingSchedules.find(
          (item) => item.name.trim().toLowerCase() === newName,
        );

        if (duplicateName) {
          throw new ConflictException(
            'Nama schedule sudah digunakan pada site ini',
          );
        }

        const conflictingSchedule = existingSchedules.find((item) =>
          this.timeRangesOverlap(
            this.timeToMinutes(startTime),
            this.timeToMinutes(endTime),
            this.timeToMinutes(item.startTime),
            this.timeToMinutes(item.endTime),
          ),
        );

        if (conflictingSchedule) {
          throw new ConflictException({
            message: 'Jam schedule bentrok dengan schedule yang sudah ada',
            existingSchedule: conflictingSchedule,
          });
        }

        const updated = await tx.patrolSchedule.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && {
              name: dto.name.trim(),
            }),
            ...(dto.startTime !== undefined && {
              startTime: dto.startTime,
            }),
            ...(dto.endTime !== undefined && {
              endTime: dto.endTime,
            }),
            ...(dto.intervalMinutes !== undefined && {
              intervalMinutes: dto.intervalMinutes,
            }),
            ...(dto.gracePeriodMinutes !== undefined && {
              gracePeriodMinutes: dto.gracePeriodMinutes,
            }),
            ...(dto.enforceSequence !== undefined && {
              enforceSequence: dto.enforceSequence,
            }),
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId: adminId,
          action: 'UPDATE',
          entityType: 'PatrolSchedule',
          entityId: id,
          oldData: {
            name: schedule.name,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            intervalMinutes: schedule.intervalMinutes,
            gracePeriodMinutes: schedule.gracePeriodMinutes,
            enforceSequence: schedule.enforceSequence,
            status: schedule.status,
          },
          newData: {
            name: updated.name,
            startTime: updated.startTime,
            endTime: updated.endTime,
            intervalMinutes: updated.intervalMinutes,
            gracePeriodMinutes: updated.gracePeriodMinutes,
            enforceSequence: updated.enforceSequence,
            status: updated.status,
          },
        });

        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async activate(scheduleId: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.patrolSchedule.findUnique({
        where: { id: scheduleId },
        include: {
          points: true,
        },
      });

      if (!schedule) {
        throw new NotFoundException('Schedule tidak ditemukan');
      }

      if (schedule.status !== ScheduleStatus.DRAFT) {
        throw new BadRequestException(
          'Hanya schedule DRAFT yang bisa diaktifkan',
        );
      }

      if (schedule.points.length === 0) {
        throw new BadRequestException(
          'Tambahkan minimal satu patrol point sebelum mengaktifkan schedule',
        );
      }

      const updated = await tx.patrolSchedule.update({
        where: { id: scheduleId },
        data: {
          status: ScheduleStatus.ACTIVE,
        },
        include: {
          site: true,
          points: {
            orderBy: { sequence: 'asc' },
            include: { patrolPoint: true },
          },
          dates: {
            orderBy: { date: 'asc' },
          },
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: adminId,
        action: 'ACTIVATE',
        entityType: 'PatrolSchedule',
        entityId: scheduleId,
        oldData: {
          status: schedule.status,
        },
        newData: {
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async archive(id: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.patrolSchedule.findUnique({
        where: { id },
      });

      if (!schedule) {
        throw new NotFoundException('Patrol schedule not found');
      }

      if (schedule.status === ScheduleStatus.ARCHIVED) {
        return schedule;
      }

      const updated = await tx.patrolSchedule.update({
        where: { id },
        data: {
          status: ScheduleStatus.ARCHIVED,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: adminId,
        action: 'ARCHIVE',
        entityType: 'PatrolSchedule',
        entityId: id,
        oldData: {
          status: schedule.status,
        },
        newData: {
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async remove(id: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.patrolSchedule.findUnique({
        where: { id },
      });

      if (!schedule) {
        throw new NotFoundException('Patrol schedule not found');
      }

      if (schedule.status !== ScheduleStatus.DRAFT) {
        throw new ConflictException('Only DRAFT schedule can be deleted');
      }

      await this.auditLogService.createAudit(tx, {
        userId: adminId,
        action: 'DELETE',
        entityType: 'PatrolSchedule',
        entityId: id,
        oldData: {
          siteId: schedule.siteId,
          name: schedule.name,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          intervalMinutes: schedule.intervalMinutes,
          gracePeriodMinutes: schedule.gracePeriodMinutes,
          enforceSequence: schedule.enforceSequence,
          status: schedule.status,
        },
      });

      await tx.patrolSchedule.delete({
        where: { id },
      });

      return {
        message: 'Schedule deleted successfully',
      };
    });
  }

  async extendDates(
    scheduleId: string,
    newDates: string[],
    createdById: string,
  ) {
    this.validateDates(newDates);

    for (const date of newDates) {
      this.parseDateOnly(date);
    }

    const today = new Date().toISOString().slice(0, 10);

    await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.patrolSchedule.findUnique({
        where: { id: scheduleId },
      });

      if (!schedule) {
        throw new NotFoundException('Patrol schedule not found');
      }

      const existingDates = await tx.patrolScheduleDate.findMany({
        where: {
          scheduleId,
          date: {
            in: newDates.map((date) => this.parseDateOnly(date)),
          },
        },
        select: {
          date: true,
        },
      });

      const existingDateKeys = new Set(
        existingDates.map((item) => this.formatDate(item.date)),
      );

      const datesToCreate = newDates.filter(
        (date) => !existingDateKeys.has(date),
      );

      if (datesToCreate.length === 0) {
        return;
      }

      await tx.patrolScheduleDate.createMany({
        data: datesToCreate.map((date) => ({
          scheduleId: schedule.id,
          date: this.parseDateOnly(date),
          status: ScheduleDateStatus.SCHEDULED,
          createdById,
        })),
      });

      await this.auditLogService.createAudit(tx, {
        userId: createdById,
        action: 'EXTEND_DATES',
        entityType: 'PatrolSchedule',
        entityId: scheduleId,
        newData: {
          addedDates: datesToCreate,
          insertedCount: datesToCreate.length,
        },
      });
    });

    if (newDates.includes(today)) {
      await this.generationService.generate(scheduleId, {
        startDate: today,
        endDate: today,
      });
    }

    return {
      message: 'Berhasil memperpanjang tanggal schedule',
    };
  }

  async addAssignment(
    scheduleId: string,
    userId: string,
    startDate: string,
    endDate: string | null,
    createdById: string,
  ) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Patrol schedule not found');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        role: { name: RoleName.SECURITY },
      },
    });

    if (!user) {
      throw new BadRequestException('User tidak valid atau bukan security');
    }

    const parsedStart = this.parseDateOnly(startDate);
    const parsedEnd = endDate ? this.parseDateOnly(endDate) : null;

    if (parsedEnd && parsedEnd < parsedStart) {
      throw new BadRequestException(
        'endDate tidak boleh lebih kecil dari startDate',
      );
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patrolScheduleAssignment.create({
        data: {
          scheduleId,
          userId,
          startDate: parsedStart,
          endDate: parsedEnd,
          status: ScheduleAssignmentStatus.ACTIVE,
          createdById,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: createdById,
        action: 'ASSIGN',
        entityType: 'PatrolScheduleAssignment',
        entityId: created.id,
        newData: {
          scheduleId,
          userId,
          startDate,
          endDate,
          status: created.status,
        },
      });

      return created;
    });

    const today = new Date().toISOString().slice(0, 10);

    if (startDate <= today && (!endDate || endDate >= today)) {
      await this.generationService.generate(scheduleId, {
        startDate: today,
        endDate: today,
      });
    }

    return assignment;
  }

  async updateAssignment(
    assignmentId: string,
    adminId: string,
    endDate?: string | null,
    status?: ScheduleAssignmentStatus,
  ) {
    const assignment = await this.prisma.patrolScheduleAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment tidak ditemukan');
    }

    const parsedEnd =
      endDate === undefined
        ? undefined
        : endDate
          ? this.parseDateOnly(endDate)
          : null;

    if (parsedEnd && parsedEnd < assignment.startDate) {
      throw new BadRequestException(
        'endDate tidak boleh lebih kecil dari startDate',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.patrolScheduleAssignment.update({
        where: { id: assignmentId },
        data: {
          ...(endDate !== undefined && { endDate: parsedEnd }),
          ...(status !== undefined && { status }),
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: adminId,
        action: 'UPDATE_ASSIGNMENT',
        entityType: 'PatrolScheduleAssignment',
        entityId: assignmentId,
        oldData: {
          scheduleId: assignment.scheduleId,
          userId: assignment.userId,
          startDate: this.formatDate(assignment.startDate),
          endDate: assignment.endDate
            ? this.formatDate(assignment.endDate)
            : null,
          status: assignment.status,
        },
        newData: {
          scheduleId: updated.scheduleId,
          userId: updated.userId,
          startDate: this.formatDate(updated.startDate),
          endDate: updated.endDate ? this.formatDate(updated.endDate) : null,
          status: updated.status,
        },
      });

      return updated;
    });
  }

  private validateTimeRange(startTime: string, endTime: string) {
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);

    if (start === end) {
      throw new BadRequestException(
        'Jam mulai dan jam selesai tidak boleh sama',
      );
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start >= 1440 ||
      end < 0 ||
      end >= 1440
    ) {
      throw new BadRequestException(
        'Format jam harus valid dalam format HH:mm',
      );
    }
  }

  private timeRangesOverlap(
    startA: number,
    endA: number,
    startB: number,
    endB: number,
  ): boolean {
    const segments = (start: number, end: number): Array<[number, number]> => {
      if (end > start) {
        return [[start, end]];
      }

      return [
        [start, 1440],
        [0, end],
      ];
    };

    return segments(startA, endA).some(([aStart, aEnd]) =>
      segments(startB, endB).some(
        ([bStart, bEnd]) => aStart < bEnd && bStart < aEnd,
      ),
    );
  }

  private validateDates(dates: string[]) {
    const uniqueDates = new Set(dates);

    if (uniqueDates.size !== dates.length) {
      throw new ConflictException('Tanggal schedule tidak boleh duplikat');
    }
  }

  private validateAssignments(dto: CreatePatrolScheduleDto) {
    const assignments = dto.assignments ?? [];

    for (const assignment of assignments) {
      if (assignment.endDate && assignment.endDate < assignment.startDate) {
        throw new BadRequestException(
          `endDate tidak boleh lebih kecil dari startDate untuk user ${assignment.userId}`,
        );
      }
    }
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private parseDateOnly(date: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(
        'Tanggal harus menggunakan format YYYY-MM-DD',
      );
    }

    const parsed = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      throw new BadRequestException('Tanggal tidak valid');
    }

    return parsed;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
