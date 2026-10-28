import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AuditLogService } from '../../audit/audit.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ScheduleAssignmentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  BulkAssignUserDto,
  CreateScheduleAssignmentDto,
} from '../dto/create.schedule.assignment.dto.js';
import { ScheduleGenerationService } from './schedule.generation.service.js';

@Injectable()
export class PatrolScheduleAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generationService: ScheduleGenerationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    scheduleId: string,
    dto: CreateScheduleAssignmentDto,
    createdById: string,
  ) {
    const schedule = await this.prisma.patrolSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        points: true,
      },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    this.assertScheduleReady(schedule);

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

    if (!dto.endDate) {
      throw new BadRequestException(
        'End date is required for automatic patrol generation',
      );
    }

    const endDate = this.parseDate(dto.endDate);

    this.assertValidDateRange(startDate, endDate);

    const overlapping = await this.findOverlappingAssignment(
      scheduleId,
      dto.userId,
      startDate,
      endDate,
    );

    if (overlapping) {
      throw new ConflictException('User already has overlapping assignment');
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patrolScheduleAssignment.create({
        data: {
          scheduleId,
          userId: dto.userId,
          startDate,
          endDate,
          status: ScheduleAssignmentStatus.ACTIVE,
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

      await this.auditLogService.createAudit(tx, {
        userId: createdById,
        action: 'CREATE_ASSIGNMENT',
        entityType: 'PatrolScheduleAssignment',
        entityId: created.id,
        newData: {
          scheduleId: created.scheduleId,
          scheduleName: schedule.name,
          userId: created.userId,
          userName: created.user.fullName,
          startDate: this.formatDate(created.startDate),
          endDate: created.endDate ? this.formatDate(created.endDate) : null,
          status: created.status,
        },
      });

      return created;
    });

    await this.generateForAssignment(scheduleId, startDate, endDate);

    return assignment;
  }

  async bulkAssignUser(dto: BulkAssignUserDto, createdById: string) {
    if (!dto.assignments || dto.assignments.length === 0) {
      throw new BadRequestException('Minimal harus ada satu assignment.');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: dto.userId,
      },
      include: {
        role: true,
      },
    });

    if (!user || user.status !== 'ACTIVE' || user.role.name !== 'SECURITY') {
      throw new BadRequestException('User tidak valid atau bukan security.');
    }

    const createdAssignments = await this.prisma.$transaction(
      async (tx) => {
        const results: Array<{
          id: string;
          scheduleId: string;
          startDate: Date;
          endDate: Date | null;
        }> = [];

        for (const assign of dto.assignments) {
          const schedule = await tx.patrolSchedule.findUnique({
            where: {
              id: assign.scheduleId,
            },
            include: {
              points: true,
            },
          });

          if (!schedule) {
            throw new NotFoundException(
              `Schedule dengan ID ${assign.scheduleId} tidak ditemukan.`,
            );
          }

          this.assertScheduleReady(schedule);

          if (user.siteId !== schedule.siteId) {
            throw new BadRequestException(
              `User tidak berada di site yang sama dengan schedule ${schedule.name}.`,
            );
          }

          const startDate = this.parseDate(assign.startDate);

          if (!assign.endDate) {
            throw new BadRequestException(
              `End date wajib diisi pada schedule ${schedule.name}.`,
            );
          }

          const endDate = this.parseDate(assign.endDate);

          this.assertValidDateRange(startDate, endDate);

          const overlapping = await tx.patrolScheduleAssignment.findFirst({
            where: {
              scheduleId: assign.scheduleId,
              userId: dto.userId,
              status: ScheduleAssignmentStatus.ACTIVE,
              startDate: {
                lte: endDate,
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

          if (overlapping) {
            throw new ConflictException(
              `User sudah memiliki assignment yang bertabrakan pada schedule ${schedule.name}.`,
            );
          }

          const newAssignment = await tx.patrolScheduleAssignment.create({
            data: {
              scheduleId: assign.scheduleId,
              userId: dto.userId,
              startDate,
              endDate,
              status: ScheduleAssignmentStatus.ACTIVE,
              createdById,
            },
          });

          await this.auditLogService.createAudit(tx, {
            userId: createdById,
            action: 'CREATE_ASSIGNMENT',
            entityType: 'PatrolScheduleAssignment',
            entityId: newAssignment.id,
            newData: {
              scheduleId: newAssignment.scheduleId,
              scheduleName: schedule.name,
              userId: newAssignment.userId,
              userName: user.fullName,
              startDate: this.formatDate(newAssignment.startDate),
              endDate: newAssignment.endDate
                ? this.formatDate(newAssignment.endDate)
                : null,
              status: newAssignment.status,
              source: 'BULK_ASSIGNMENT',
            },
          });

          results.push({
            id: newAssignment.id,
            scheduleId: newAssignment.scheduleId,
            startDate: newAssignment.startDate,
            endDate: newAssignment.endDate,
          });
        }

        return results;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    const generationResults: Array<{
      assignmentId: string;
      scheduleId: string;
      status: 'SUCCESS' | 'FAILED';
      message?: string;
    }> = [];

    for (const assignment of createdAssignments) {
      if (!assignment.endDate) {
        generationResults.push({
          assignmentId: assignment.id,
          scheduleId: assignment.scheduleId,
          status: 'FAILED',
          message: 'Assignment tidak memiliki endDate.',
        });

        continue;
      }

      try {
        await this.generateForAssignment(
          assignment.scheduleId,
          assignment.startDate,
          assignment.endDate,
        );

        generationResults.push({
          assignmentId: assignment.id,
          scheduleId: assignment.scheduleId,
          status: 'SUCCESS',
        });
      } catch (error) {
        generationResults.push({
          assignmentId: assignment.id,
          scheduleId: assignment.scheduleId,
          status: 'FAILED',
          message:
            error instanceof Error ? error.message : 'Patrol generation failed',
        });
      }
    }

    return {
      message: 'Bulk assignment selesai diproses.',
      assignmentsCreated: createdAssignments.length,
      assignments: createdAssignments,
      generationResults,
    };
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

  async findAllAssignments() {
    return this.prisma.patrolScheduleAssignment.findMany({
      where: {
        status: ScheduleAssignmentStatus.ACTIVE,
      },
      include: {
        user: true,
        schedule: {
          include: {
            site: true,
          },
        },
      },
      orderBy: [
        {
          startDate: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async remove(scheduleId: string, id: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.patrolScheduleAssignment.findFirst({
        where: {
          id,
          scheduleId,
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
            },
          },
        },
      });

      if (!assignment) {
        throw new NotFoundException('Assignment not found');
      }

      const rounds = await tx.patrolRound.count({
        where: {
          assignmentId: id,
        },
      });

      if (rounds > 0) {
        throw new ConflictException(
          'Assignment cannot be deleted because rounds already exist',
        );
      }

      await this.auditLogService.createAudit(tx, {
        userId: adminId,
        action: 'DELETE_ASSIGNMENT',
        entityType: 'PatrolScheduleAssignment',
        entityId: assignment.id,
        oldData: {
          scheduleId: assignment.scheduleId,
          scheduleName: assignment.schedule.name,
          userId: assignment.userId,
          userName: assignment.user.fullName,
          employeeNumber: assignment.user.employeeNumber,
          startDate: this.formatDate(assignment.startDate),
          endDate: assignment.endDate
            ? this.formatDate(assignment.endDate)
            : null,
          status: assignment.status,
        },
      });

      await tx.patrolScheduleAssignment.delete({
        where: {
          id,
        },
      });

      return {
        message: 'Schedule assignment deleted successfully',
      };
    });
  }

  private assertScheduleReady(schedule: { status: string; points: unknown[] }) {
    if (schedule.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Shift harus berstatus ACTIVE sebelum satpam di-assign.',
      );
    }

    if (!schedule.points || schedule.points.length === 0) {
      throw new BadRequestException(
        'Shift belum memiliki titik patroli. Tambahkan points sebelum assignment.',
      );
    }
  }

  private async generateForAssignment(
    scheduleId: string,
    startDate: Date,
    endDate: Date,
  ) {
    try {
      return await this.generationService.generate(scheduleId, {
        startDate: this.formatDate(startDate),
        endDate: this.formatDate(endDate),
        force: false,
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unknown generation error';

      throw new ServiceUnavailableException(
        `Assignment sudah tersimpan, tetapi generate patroli gagal. Jangan membuat assignment ulang. Coba ulangi proses generate. Detail: ${detail}`,
      );
    }
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
        status: ScheduleAssignmentStatus.ACTIVE,
        startDate: {
          lte: endDate ?? new Date('9999-12-31T00:00:00.000Z'),
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

  private assertValidDateRange(startDate: Date, endDate: Date) {
    if (endDate < startDate) {
      throw new BadRequestException('End date cannot be before start date');
    }
  }

  private parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(
        `Invalid date format: ${value}. Use YYYY-MM-DD.`,
      );
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }

    return date;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
