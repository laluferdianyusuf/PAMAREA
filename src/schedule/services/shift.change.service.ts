import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PatrolRoundStatus,
  Prisma,
  ScheduleAssignmentStatus,
  ShiftChangeStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateShiftChangeDto } from '../dto/change.shift.dto.js';

type Tx = Prisma.TransactionClient;
type Assignment = Awaited<
  ReturnType<ShiftChangeService['loadAssignments']>
>[number];

@Injectable()
export class ShiftChangeService {
  private readonly timezone = 'Asia/Makassar';

  constructor(private readonly prisma: PrismaService) {}

  async request(dto: CreateShiftChangeDto, adminId: string) {
    const effectiveDate = this.parseDate(dto.effectiveDate);

    this.assertFutureDate(effectiveDate);

    if (dto.firstAssignmentId === dto.secondAssignmentId) {
      throw new BadRequestException('Pilih dua assignment yang berbeda.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const [first, second] = await this.loadAssignments(
          tx,
          dto.firstAssignmentId,
          dto.secondAssignmentId,
        );
        this.validateAssignments(first, second, effectiveDate);
        this.validateAssignments(first, second, effectiveDate);

        await this.assertNoScheduleConflict(tx, first, second, effectiveDate);

        await this.assertNoPendingChange(
          tx,
          first.id,
          second.id,
          effectiveDate,
        );

        await this.assertNoAssignmentKeyCollision(
          tx,
          first,
          second,
          effectiveDate,
        );

        await this.assertEffectiveDateRoundsArePending(
          tx,
          first.id,
          second.id,
          effectiveDate,
        );

        const firstContinuation = await this.splitAssignment(
          tx,
          first,
          effectiveDate,
        );

        const secondContinuation = await this.splitAssignment(
          tx,
          second,
          effectiveDate,
        );

        const firstSwap = await tx.patrolScheduleAssignment.create({
          data: {
            scheduleId: first.scheduleId,
            userId: second.userId,
            startDate: effectiveDate,
            endDate: effectiveDate,
            status: ScheduleAssignmentStatus.ACTIVE,
            createdById: adminId,
          },
        });

        const secondSwap = await tx.patrolScheduleAssignment.create({
          data: {
            scheduleId: second.scheduleId,
            userId: first.userId,
            startDate: effectiveDate,
            endDate: effectiveDate,
            status: ScheduleAssignmentStatus.ACTIVE,
            createdById: adminId,
          },
        });

        await this.moveRounds(
          tx,
          first.id,
          firstSwap.id,
          firstContinuation?.id ?? null,
          effectiveDate,
        );

        await this.moveRounds(
          tx,
          second.id,
          secondSwap.id,
          secondContinuation?.id ?? null,
          effectiveDate,
        );

        const now = new Date();

        return tx.shiftChange.create({
          data: {
            firstAssignmentId: first.id,
            secondAssignmentId: second.id,
            effectiveDate,
            reason: dto.reason?.trim() || null,
            requestedById: adminId,
            approvedById: adminId,
            approvedAt: now,
            status: ShiftChangeStatus.APPROVED,
          },
          include: {
            firstAssignment: {
              include: {
                user: true,
                schedule: true,
              },
            },
            secondAssignment: {
              include: {
                user: true,
                schedule: true,
              },
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async findAll(params: { status?: string; effectiveDate?: string }) {
    const where: Prisma.ShiftChangeWhereInput = {};

    if (params.status) {
      if (
        !Object.values(ShiftChangeStatus).includes(
          params.status as ShiftChangeStatus,
        )
      ) {
        throw new BadRequestException('Status tukar shift tidak valid.');
      }

      where.status = params.status as ShiftChangeStatus;
    }

    if (params.effectiveDate) {
      where.effectiveDate = this.parseDate(params.effectiveDate);
    }

    return this.prisma.shiftChange.findMany({
      where,
      include: {
        firstAssignment: {
          include: {
            user: true,
            schedule: true,
          },
        },
        secondAssignment: {
          include: {
            user: true,
            schedule: true,
          },
        },
      },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const change = await this.prisma.shiftChange.findUnique({
      where: { id },
      include: {
        firstAssignment: {
          include: {
            user: true,
            schedule: true,
          },
        },
        secondAssignment: {
          include: {
            user: true,
            schedule: true,
          },
        },
      },
    });

    if (!change) {
      throw new NotFoundException('Histori tukar shift tidak ditemukan.');
    }

    return change;
  }

  private async loadAssignments(tx: Tx, firstId: string, secondId: string) {
    const assignments = await tx.patrolScheduleAssignment.findMany({
      where: {
        id: {
          in: [firstId, secondId],
        },
      },
      include: {
        schedule: {
          include: {
            site: true,
          },
        },
        user: {
          include: {
            role: true,
          },
        },
      },
    });

    const first = assignments.find((item) => item.id === firstId);
    const second = assignments.find((item) => item.id === secondId);

    if (!first || !second) {
      throw new NotFoundException('Salah satu assignment tidak ditemukan.');
    }

    return [first, second] as const;
  }

  private validateAssignments(
    first: Assignment,
    second: Assignment,
    date: Date,
  ) {
    if (
      first.status !== ScheduleAssignmentStatus.ACTIVE ||
      second.status !== ScheduleAssignmentStatus.ACTIVE
    ) {
      throw new ConflictException('Kedua assignment harus berstatus ACTIVE.');
    }

    if (
      first.schedule.status !== 'ACTIVE' ||
      second.schedule.status !== 'ACTIVE'
    ) {
      throw new ConflictException('Kedua jadwal harus berstatus ACTIVE.');
    }

    if (first.scheduleId === second.scheduleId) {
      throw new BadRequestException(
        'Tukar shift harus melibatkan dua jadwal berbeda.',
      );
    }

    if (first.schedule.siteId !== second.schedule.siteId) {
      throw new BadRequestException(
        'Tukar shift hanya dapat dilakukan pada site yang sama.',
      );
    }

    if (first.userId === second.userId) {
      throw new BadRequestException(
        'Kedua assignment harus dimiliki petugas berbeda.',
      );
    }

    if (first.user.status !== 'ACTIVE' || second.user.status !== 'ACTIVE') {
      throw new ConflictException('Kedua petugas harus berstatus ACTIVE.');
    }

    for (const assignment of [first, second]) {
      const startDate = this.toDateOnly(assignment.startDate);
      const endDate = assignment.endDate
        ? this.toDateOnly(assignment.endDate)
        : null;

      if (date < startDate || (endDate !== null && date > endDate)) {
        throw new ConflictException(
          'Tanggal efektif berada di luar rentang assignment.',
        );
      }
    }
  }

  private async assertNoScheduleConflict(
    tx: Tx,
    first: Assignment,
    second: Assignment,
    date: Date,
  ) {
    const others = await tx.patrolScheduleAssignment.findMany({
      where: {
        id: {
          notIn: [first.id, second.id],
        },
        status: ScheduleAssignmentStatus.ACTIVE,
        userId: {
          in: [first.userId, second.userId],
        },
        startDate: {
          lte: date,
        },
        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: date,
            },
          },
        ],
      },
      include: {
        schedule: true,
      },
    });

    const swaps = [
      {
        userId: second.userId,
        schedule: first.schedule,
      },
      {
        userId: first.userId,
        schedule: second.schedule,
      },
    ];

    for (const swap of swaps) {
      for (const other of others) {
        if (other.userId !== swap.userId) {
          continue;
        }

        if (this.timesOverlap(swap.schedule, other.schedule)) {
          throw new ConflictException(
            `Petugas memiliki konflik jadwal pada tanggal ${this.formatDate(date)}.`,
          );
        }
      }
    }
  }

  private async assertNoPendingChange(
    tx: Tx,
    firstId: string,
    secondId: string,
    date: Date,
  ) {
    const conflict = await tx.shiftChange.findFirst({
      where: {
        status: ShiftChangeStatus.PENDING,
        effectiveDate: date,
        OR: [
          {
            firstAssignmentId: {
              in: [firstId, secondId],
            },
          },
          {
            secondAssignmentId: {
              in: [firstId, secondId],
            },
          },
        ],
      },
    });

    if (conflict) {
      throw new ConflictException(
        'Assignment memiliki permintaan tukar shift lama yang masih PENDING.',
      );
    }
  }

  private async assertNoAssignmentKeyCollision(
    tx: Tx,
    first: Assignment,
    second: Assignment,
    date: Date,
  ) {
    const collision = await tx.patrolScheduleAssignment.findFirst({
      where: {
        OR: [
          {
            scheduleId: first.scheduleId,
            userId: second.userId,
            startDate: date,
          },
          {
            scheduleId: second.scheduleId,
            userId: first.userId,
            startDate: date,
          },
        ],
      },
    });

    if (collision) {
      throw new ConflictException(
        'Assignment tukar tidak dapat dibuat karena kombinasi jadwal, petugas, dan tanggal mulai sudah digunakan.',
      );
    }
  }

  private async assertEffectiveDateRoundsArePending(
    tx: Tx,
    firstId: string,
    secondId: string,
    date: Date,
  ) {
    const blocked = await tx.patrolRound.findFirst({
      where: {
        assignmentId: {
          in: [firstId, secondId],
        },
        scheduleDate: {
          date,
        },
        status: {
          not: PatrolRoundStatus.PENDING,
        },
      },
      select: {
        id: true,
      },
    });

    if (blocked) {
      throw new ConflictException(
        'Tukar shift tidak dapat dilakukan karena sudah ada round yang berjalan atau selesai pada tanggal efektif.',
      );
    }
  }

  private async splitAssignment(tx: Tx, assignment: Assignment, date: Date) {
    const assignmentStart = this.toDateOnly(assignment.startDate);
    const nextDate = this.addDays(date, 1);
    const previousDate = this.addDays(date, -1);

    const originalEnd = assignment.endDate
      ? this.toDateOnly(assignment.endDate)
      : null;

    const needsContinuation = originalEnd === null || originalEnd > date;

    if (needsContinuation) {
      const collision = await tx.patrolScheduleAssignment.findFirst({
        where: {
          scheduleId: assignment.scheduleId,
          userId: assignment.userId,
          startDate: nextDate,
        },
      });

      if (collision) {
        throw new ConflictException(
          'Assignment lanjutan tidak dapat dibuat karena tanggal mulai sudah digunakan.',
        );
      }
    }

    if (assignmentStart < date) {
      await tx.patrolScheduleAssignment.update({
        where: {
          id: assignment.id,
        },
        data: {
          endDate: previousDate,
        },
      });
    } else {
      await tx.patrolScheduleAssignment.update({
        where: {
          id: assignment.id,
        },
        data: {
          status: ScheduleAssignmentStatus.INACTIVE,
        },
      });
    }

    if (!needsContinuation) {
      return null;
    }

    return tx.patrolScheduleAssignment.create({
      data: {
        scheduleId: assignment.scheduleId,
        userId: assignment.userId,
        startDate: nextDate,
        endDate: originalEnd,
        status: ScheduleAssignmentStatus.ACTIVE,
        createdById: assignment.createdById,
      },
    });
  }

  private async moveRounds(
    tx: Tx,
    oldAssignmentId: string,
    swapAssignmentId: string,
    continuationAssignmentId: string | null,
    effectiveDate: Date,
  ) {
    const rounds = await tx.patrolRound.findMany({
      where: {
        assignmentId: oldAssignmentId,
        scheduleDate: {
          date: {
            gte: effectiveDate,
          },
        },
      },
      include: {
        scheduleDate: true,
      },
      orderBy: [
        {
          scheduleDate: {
            date: 'asc',
          },
        },
        {
          roundNumber: 'asc',
        },
      ],
    });

    for (const round of rounds) {
      const roundDate = this.toDateOnly(round.scheduleDate.date);
      const isEffectiveDate = roundDate.getTime() === effectiveDate.getTime();

      if (round.status !== PatrolRoundStatus.PENDING) {
        if (isEffectiveDate) {
          throw new ConflictException(
            'Round pada tanggal efektif sudah tidak berstatus PENDING.',
          );
        }

        // Round masa depan yang sudah diproses tidak diubah.
        continue;
      }

      const targetAssignmentId = isEffectiveDate
        ? swapAssignmentId
        : continuationAssignmentId;

      if (!targetAssignmentId) {
        throw new ConflictException(
          'Round mendatang tidak memiliki assignment lanjutan.',
        );
      }

      const collision = await tx.patrolRound.findUnique({
        where: {
          scheduleDateId_assignmentId_roundNumber: {
            scheduleDateId: round.scheduleDateId,
            assignmentId: targetAssignmentId,
            roundNumber: round.roundNumber,
          },
        },
        select: {
          id: true,
        },
      });

      if (collision && collision.id !== round.id) {
        throw new ConflictException(
          'Pemindahan round menyebabkan konflik nomor round pada tanggal yang sama.',
        );
      }

      await tx.patrolRound.update({
        where: {
          id: round.id,
        },
        data: {
          assignmentId: targetAssignmentId,
        },
      });
    }
  }

  private timesOverlap(
    first: {
      startTime: string;
      endTime: string;
    },
    second: {
      startTime: string;
      endTime: string;
    },
  ) {
    const a = this.interval(first.startTime, first.endTime);
    const b = this.interval(second.startTime, second.endTime);

    for (const offset of [-1440, 0, 1440]) {
      const bStart = b.start + offset;
      const bEnd = b.end + offset;

      if (a.start < bEnd && bStart < a.end) {
        return true;
      }
    }

    return false;
  }

  private interval(startTime: string, endTime: string) {
    const start = this.minutes(startTime);
    let end = this.minutes(endTime);

    if (end <= start) {
      end += 1440;
    }

    return {
      start,
      end,
    };
  }

  private minutes(value: string) {
    const [hour, minute] = value.split(':').map(Number);

    return hour * 60 + minute;
  }

  private assertFutureDate(date: Date) {
    const today = this.todayInMakassar();

    if (date.getTime() <= today.getTime()) {
      throw new BadRequestException(
        'Tanggal tukar shift harus setelah hari ini di zona waktu Asia/Makassar.',
      );
    }
  }

  private todayInMakassar() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    return this.parseDate(`${values.year}-${values.month}-${values.day}`);
  }

  private parseDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(
        'Tanggal harus menggunakan format YYYY-MM-DD.',
      );
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('Tanggal tidak valid.');
    }

    return date;
  }

  private toDateOnly(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private addDays(date: Date, days: number) {
    const result = this.toDateOnly(date);
    result.setUTCDate(result.getUTCDate() + days);

    return result;
  }

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
