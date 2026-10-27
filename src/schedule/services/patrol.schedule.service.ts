import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PatrolPointStatus,
  RoleName,
  ScheduleAssignmentStatus,
  ScheduleDateStatus,
  ScheduleStatus,
  UserStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreatePatrolScheduleDto } from '../dto/create.schedule.dto.js';
import { ScheduleFilterDto } from '../dto/schedule.filter.dto.js';
import { UpdatePatrolScheduleDto } from '../dto/update.schedule.dto.js';
import { PatrolSchedulePolicy } from '../policies/patrol.schedule.policy.service.js';
import { PatrolScheduleRepository } from '../repositories/patrol-schedule.repository.js';
import { ScheduleGenerationService } from './schedule.generation.service.js';

@Injectable()
export class PatrolScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PatrolScheduleRepository,
    private readonly policy: PatrolSchedulePolicy,
    private readonly generationService: ScheduleGenerationService,
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

        return tx.patrolSchedule.findUniqueOrThrow({
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
      },
      {
        isolationLevel: 'Serializable',
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
        status: 'ACTIVE',
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

    return Array.from(rosterMap.values());
  }

  async update(id: string, dto: UpdatePatrolScheduleDto) {
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

        return tx.patrolSchedule.update({
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
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  async activate(scheduleId: string) {
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

      return tx.patrolSchedule.update({
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
    });
  }

  async archive(id: string) {
    const schedule = await this.repository.findBasicById(id);

    if (!schedule) {
      throw new NotFoundException('Patrol schedule not found');
    }

    if (schedule.status === 'ARCHIVED') {
      return schedule;
    }

    return this.prisma.patrolSchedule.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  async remove(id: string) {
    const schedule = await this.repository.findBasicById(id);

    if (!schedule) {
      throw new NotFoundException('Patrol schedule not found');
    }

    if (schedule.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT schedule can be deleted');
    }

    await this.prisma.patrolSchedule.delete({
      where: { id },
    });

    return {
      message: 'Schedule deleted successfully',
    };
  }

  async extendDates(
    scheduleId: string,
    newDates: string[],
    createdById: string,
  ) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Patrol schedule not found');
    }

    this.validateDates(newDates);

    await this.prisma.patrolScheduleDate.createMany({
      data: newDates.map((date) => ({
        scheduleId: schedule.id,
        date: this.parseDateOnly(date),
        status: ScheduleDateStatus.SCHEDULED,
        createdById,
      })),
      skipDuplicates: true,
    });

    const today = new Date().toISOString().split('T')[0];

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
        status: 'ACTIVE',
        role: { name: 'SECURITY' },
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

    const assignment = await this.prisma.patrolScheduleAssignment.create({
      data: {
        scheduleId,
        userId,
        startDate: parsedStart,
        endDate: parsedEnd,
        status: ScheduleAssignmentStatus.ACTIVE,
        createdById,
      },
    });

    const today = new Date().toISOString().split('T')[0];

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
    endDate?: string | null,
    status?: ScheduleAssignmentStatus,
  ) {
    const assignment = await this.prisma.patrolScheduleAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment tidak ditemukan');
    }

    const parsedEnd = endDate ? this.parseDateOnly(endDate) : null;

    if (parsedEnd && parsedEnd < assignment.startDate) {
      throw new BadRequestException(
        'endDate tidak boleh lebih kecil dari startDate',
      );
    }

    return this.prisma.patrolScheduleAssignment.update({
      where: { id: assignmentId },
      data: {
        ...(endDate !== undefined && { endDate: parsedEnd }),
        ...(status !== undefined && { status }),
      },
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
    return new Date(`${date}T00:00:00.000Z`);
  }
}
