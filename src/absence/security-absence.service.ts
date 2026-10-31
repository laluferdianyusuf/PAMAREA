import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../audit/audit.service.js';
import { ScheduleTimeUtil } from '../common/utils/schedule-time.util.js';
import {
  AbsenceStatus,
  Prisma,
  ReplacementStatus,
  RoleName,
  ScheduleAssignmentStatus,
  ScheduleStatus,
  UserStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSecurityAbsenceDto } from './dto/create-security-absence.dto.js';
import { QuerySecurityAbsenceDto } from './dto/query-security-absence.dto.js';

type Tx = Prisma.TransactionClient;

@Injectable()
export class SecurityAbsenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private parseDate(value: string): Date {
    return ScheduleTimeUtil.parseDate(value);
  }

  private validateDateRange(startDate: Date, endDate: Date) {
    if (endDate < startDate) {
      throw new BadRequestException(
        'Tanggal selesai tidak boleh sebelum tanggal mulai',
      );
    }
  }

  private isDateOverlap(
    firstStart: Date,
    firstEnd: Date | null,
    secondStart: Date,
    secondEnd: Date | null,
  ) {
    const firstEndValue = firstEnd ?? new Date('9999-12-31T00:00:00.000Z');
    const secondEndValue = secondEnd ?? new Date('9999-12-31T00:00:00.000Z');

    return firstStart <= secondEndValue && secondStart <= firstEndValue;
  }

  private timeToMinutes(value: string): number {
    const normalized = ScheduleTimeUtil.normalizeTime(value);
    const [hour, minute] = normalized.split(':').map(Number);

    return hour * 60 + minute;
  }

  private timeRangesOverlap(
    firstStart: string,
    firstEnd: string,
    secondStart: string,
    secondEnd: string,
  ): boolean {
    const aStart = this.timeToMinutes(firstStart);
    const bStart = this.timeToMinutes(secondStart);

    let aEnd = this.timeToMinutes(firstEnd);
    let bEnd = this.timeToMinutes(secondEnd);

    if (aEnd <= aStart) aEnd += 1440;
    if (bEnd <= bStart) bEnd += 1440;

    // Memeriksa kemungkinan jadwal melewati tengah malam.
    for (const offset of [-1440, 0, 1440]) {
      const shiftedStart = bStart + offset;
      const shiftedEnd = bEnd + offset;

      if (aStart < shiftedEnd && shiftedStart < aEnd) {
        return true;
      }
    }

    return false;
  }

  private async validateSecurityUser(tx: Tx, userId: string, siteId: string) {
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        siteId,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        role: {
          name: RoleName.SECURITY,
        },
      },
      select: {
        id: true,
        fullName: true,
        employeeNumber: true,
        siteId: true,
      },
    });

    if (!user) {
      throw new BadRequestException(
        `Petugas ${userId} tidak ditemukan, tidak aktif, atau bukan SECURITY pada site tersebut`,
      );
    }

    return user;
  }

  private async validateReplacementAvailability(
    tx: Tx,
    replacementUserId: string,
    originalAssignment: {
      id: string;
      scheduleId: string;
      startDate: Date;
      endDate: Date | null;
      schedule: {
        siteId: string;
        startTime: string;
        endTime: string;
      };
    },
    startDate: Date,
    endDate: Date,
  ) {
    const existingAssignments = await tx.patrolScheduleAssignment.findMany({
      where: {
        userId: replacementUserId,
        status: ScheduleAssignmentStatus.ACTIVE,
        scheduleId: {
          not: originalAssignment.scheduleId,
        },
        startDate: {
          lte: endDate,
        },
        OR: [{ endDate: null }, { endDate: { gte: startDate } }],
      },
      include: {
        schedule: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            status: true,
          },
        },
      },
    });

    for (const assignment of existingAssignments) {
      if (
        assignment.schedule.status === ScheduleStatus.ARCHIVED ||
        assignment.schedule.status === ScheduleStatus.INACTIVE
      ) {
        continue;
      }

      if (
        this.isDateOverlap(
          assignment.startDate,
          assignment.endDate,
          startDate,
          endDate,
        ) &&
        this.timeRangesOverlap(
          originalAssignment.schedule.startTime,
          originalAssignment.schedule.endTime,
          assignment.schedule.startTime,
          assignment.schedule.endTime,
        )
      ) {
        throw new ConflictException({
          message: 'Petugas pengganti memiliki jadwal yang bentrok',
          replacementUserId,
          conflictingSchedule: assignment.schedule.name,
          conflictingAssignmentId: assignment.id,
        });
      }
    }

    // Cek juga assignment lain pada schedule yang sama.
    const sameScheduleAssignment = await tx.patrolScheduleAssignment.findFirst({
      where: {
        scheduleId: originalAssignment.scheduleId,
        userId: replacementUserId,
        status: ScheduleAssignmentStatus.ACTIVE,
        startDate: { lte: endDate },
        OR: [{ endDate: null }, { endDate: { gte: startDate } }],
      },
    });

    if (sameScheduleAssignment) {
      throw new ConflictException(
        'Petugas pengganti sudah memiliki assignment pada jadwal yang sama',
      );
    }
  }

  async create(dto: CreateSecurityAbsenceDto, createdById: string) {
    const startDate = this.parseDate(dto.startDate);
    const endDate = this.parseDate(dto.endDate);

    this.validateDateRange(startDate, endDate);

    if (dto.userId === dto.replacementUserId) {
      throw new BadRequestException(
        'Petugas pengganti tidak boleh sama dengan petugas yang cuti',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const originalUser = await tx.user.findFirst({
          where: {
            id: dto.userId,
            status: UserStatus.ACTIVE,
            deletedAt: null,
            role: { name: RoleName.SECURITY },
          },
          select: {
            id: true,
            fullName: true,
            siteId: true,
          },
        });

        if (!originalUser || !originalUser.siteId) {
          throw new NotFoundException(
            'Petugas tidak ditemukan atau tidak memiliki site',
          );
        }

        const siteId = originalUser.siteId;

        if (dto.replacementUserId) {
          await this.validateSecurityUser(tx, dto.replacementUserId, siteId);
        }

        // Cegah pencatatan ketidakhadiran aktif yang bertumpuk.
        const overlappingAbsence = await tx.securityAbsence.findFirst({
          where: {
            userId: dto.userId,
            status: AbsenceStatus.ACTIVE,
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        });

        if (overlappingAbsence) {
          throw new ConflictException(
            'Petugas sudah memiliki ketidakhadiran aktif pada periode tersebut',
          );
        }

        const originalAssignments = await tx.patrolScheduleAssignment.findMany({
          where: {
            userId: dto.userId,
            status: ScheduleAssignmentStatus.ACTIVE,
            startDate: { lte: endDate },
            OR: [{ endDate: null }, { endDate: { gte: startDate } }],
            schedule: {
              siteId,
              status: {
                not: ScheduleStatus.ARCHIVED,
              },
            },
          },
          include: {
            schedule: {
              select: {
                id: true,
                name: true,
                siteId: true,
                startTime: true,
                endTime: true,
                status: true,
              },
            },
            patrolPoints: {
              orderBy: {
                sequence: 'asc',
              },
              select: {
                patrolPointId: true,
                sequence: true,
                required: true,
              },
            },
          },
        });

        const absence = await tx.securityAbsence.create({
          data: {
            userId: dto.userId,
            siteId,
            createdById,
            type: dto.type,
            startDate,
            endDate,
            reason: dto.reason?.trim() || null,
            status: AbsenceStatus.ACTIVE,
          },
        });

        const createdReplacements: any[] = [];

        if (dto.replacementUserId) {
          for (const original of originalAssignments) {
            const replacementStart =
              original.startDate > startDate ? original.startDate : startDate;

            const replacementEnd =
              original.endDate && original.endDate < endDate
                ? original.endDate
                : endDate;

            if (replacementEnd < replacementStart) {
              continue;
            }

            await this.validateReplacementAvailability(
              tx,
              dto.replacementUserId,
              original,
              replacementStart,
              replacementEnd,
            );

            const originalRounds = await tx.patrolRound.findMany({
              where: {
                assignmentId: original.id,
                scheduleDate: {
                  date: {
                    gte: replacementStart,
                    lte: replacementEnd,
                  },
                },
              },
              select: {
                id: true,
                scheduleDateId: true,
                assignmentId: true,
                roundNumber: true,
                status: true,
              },
            });

            const processedRound = originalRounds.find(
              (round) => round.status !== 'PENDING',
            );

            if (processedRound) {
              throw new ConflictException({
                message:
                  'Penggantian ditolak karena sudah ada ronde yang berjalan atau selesai pada periode tersebut',
                assignmentId: original.id,
                roundId: processedRound.id,
                roundStatus: processedRound.status,
              });
            }

            // Hindari bentrok unique:
            // scheduleDateId + assignmentId + roundNumber.
            if (originalRounds.length > 0) {
              const collision = await tx.patrolRound.findFirst({
                where: {
                  assignmentId: {
                    not: original.id,
                  },
                  scheduleDateId: {
                    in: originalRounds.map((round) => round.scheduleDateId),
                  },
                  roundNumber: {
                    in: originalRounds.map((round) => round.roundNumber),
                  },
                  assignment: {
                    scheduleId: original.scheduleId,
                    userId: dto.replacementUserId,
                  },
                },
              });

              if (collision) {
                throw new ConflictException(
                  'Ronde petugas pengganti sudah tersedia pada periode tersebut',
                );
              }
            }

            const replacementAssignment =
              await tx.patrolScheduleAssignment.create({
                data: {
                  scheduleId: original.scheduleId,
                  userId: dto.replacementUserId,
                  startDate: replacementStart,
                  endDate: replacementEnd,
                  status: ScheduleAssignmentStatus.ACTIVE,
                  createdById,
                  patrolPoints: {
                    create: original.patrolPoints.map((point) => ({
                      patrolPointId: point.patrolPointId,
                      sequence: point.sequence,
                      required: point.required,
                    })),
                  },
                },
              });

            // Pindahkan hanya ronde yang belum dimulai.
            if (originalRounds.length > 0) {
              await tx.patrolRound.updateMany({
                where: {
                  id: {
                    in: originalRounds.map((round) => round.id),
                  },
                  status: 'PENDING',
                },
                data: {
                  assignmentId: replacementAssignment.id,
                },
              });
            }

            const replacement = await tx.scheduleReplacement.create({
              data: {
                absenceId: absence.id,
                originalAssignmentId: original.id,
                replacementAssignmentId: replacementAssignment.id,
                replacementUserId: dto.replacementUserId,
                createdById,
                startDate: replacementStart,
                endDate: replacementEnd,
                status: ReplacementStatus.ACTIVE,
              },
              include: {
                replacementAssignment: true,
              },
            });

            createdReplacements.push(replacement);
          }
        }

        await this.auditLogService.createAudit(tx, {
          userId: createdById,
          action: 'CREATE',
          entityType: 'SecurityAbsence',
          entityId: absence.id,
          newData: {
            userId: dto.userId,
            userName: originalUser.fullName,
            replacementUserId: dto.replacementUserId ?? null,
            type: dto.type,
            startDate,
            endDate,
            reason: dto.reason ?? null,
            replacements: createdReplacements.map((item) => ({
              id: item.id,
              originalAssignmentId: item.originalAssignmentId,
              replacementAssignmentId: item.replacementAssignmentId,
              startDate: item.startDate,
              endDate: item.endDate,
            })),
          },
        });

        return {
          ...absence,
          replacements: createdReplacements,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async findAll(query: QuerySecurityAbsenceDto) {
    const startDate = query.startDate
      ? this.parseDate(query.startDate)
      : undefined;

    const endDate = query.endDate ? this.parseDate(query.endDate) : undefined;

    if (startDate && endDate) {
      this.validateDateRange(startDate, endDate);
    }

    return this.prisma.securityAbsence.findMany({
      where: {
        ...(query.siteId && { siteId: query.siteId }),
        ...(query.userId && { userId: query.userId }),
        ...(startDate || endDate
          ? {
              startDate: endDate ? { lte: endDate } : undefined,
              endDate: startDate ? { gte: startDate } : undefined,
            }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
          },
        },
        site: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        replacements: {
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
                    id: true,
                    name: true,
                    startTime: true,
                    endTime: true,
                  },
                },
              },
            },
            replacementAssignment: true,
          },
        },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const absence = await this.prisma.securityAbsence.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
          },
        },
        site: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        replacements: {
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
                schedule: true,
                user: {
                  select: {
                    id: true,
                    fullName: true,
                  },
                },
              },
            },
            replacementAssignment: true,
          },
        },
      },
    });

    if (!absence) {
      throw new NotFoundException('Data ketidakhadiran tidak ditemukan');
    }

    return absence;
  }

  async cancel(id: string, cancelledById: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const absence = await tx.securityAbsence.findUnique({
          where: { id },
          include: {
            replacements: {
              where: {
                status: ReplacementStatus.ACTIVE,
              },
              include: {
                replacementAssignment: true,
                originalAssignment: true,
              },
            },
          },
        });

        if (!absence) {
          throw new NotFoundException('Data ketidakhadiran tidak ditemukan');
        }

        if (absence.status === AbsenceStatus.CANCELLED) {
          throw new ConflictException('Ketidakhadiran sudah dibatalkan');
        }

        for (const replacement of absence.replacements) {
          const pendingRounds = await tx.patrolRound.findMany({
            where: {
              assignmentId: replacement.replacementAssignmentId,
              status: 'PENDING',
              scheduleDate: {
                date: {
                  gte: replacement.startDate,
                  lte: replacement.endDate,
                },
              },
            },
            select: {
              id: true,
              scheduleDateId: true,
              roundNumber: true,
            },
          });

          if (pendingRounds.length > 0) {
            const collision = await tx.patrolRound.findFirst({
              where: {
                assignmentId: replacement.originalAssignmentId,
                scheduleDateId: {
                  in: pendingRounds.map((round) => round.scheduleDateId),
                },
                roundNumber: {
                  in: pendingRounds.map((round) => round.roundNumber),
                },
              },
            });

            if (collision) {
              throw new ConflictException(
                'Ronde tidak dapat dikembalikan karena sudah ada ronde pada assignment asli',
              );
            }

            await tx.patrolRound.updateMany({
              where: {
                id: {
                  in: pendingRounds.map((round) => round.id),
                },
                status: 'PENDING',
              },
              data: {
                assignmentId: replacement.originalAssignmentId,
              },
            });
          }

          await tx.scheduleReplacement.update({
            where: { id: replacement.id },
            data: {
              status: ReplacementStatus.CANCELLED,
            },
          });

          await tx.patrolScheduleAssignment.update({
            where: {
              id: replacement.replacementAssignmentId,
            },
            data: {
              status: ScheduleAssignmentStatus.INACTIVE,
            },
          });
        }

        const updated = await tx.securityAbsence.update({
          where: { id },
          data: {
            status: AbsenceStatus.CANCELLED,
          },
          include: {
            replacements: true,
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId: cancelledById,
          action: 'UPDATE',
          entityType: 'SecurityAbsence',
          entityId: id,
          oldData: {
            status: absence.status,
          },
          newData: {
            status: AbsenceStatus.CANCELLED,
            cancelledReplacements: absence.replacements.map((item) => item.id),
          },
        });

        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}
