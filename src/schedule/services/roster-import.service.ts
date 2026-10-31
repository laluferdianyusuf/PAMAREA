import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ScheduleAssignmentStatus,
  ScheduleStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ParsedRosterRow,
  ParsedRosterWorkbook,
  RosterExcelService,
  RosterShiftCode,
} from './roster-excel.service.js';
import { ScheduleGenerationService } from './schedule.generation.service.js';

interface ResolvedRosterUser {
  id: string;
  employeeNumber: string | null;
  username: string;
  fullName: string;
}

interface AssignmentPlan {
  userId: string;
  userName: string;
  scheduleId: string;
  scheduleName: string;
  startDate: Date;
  endDate: Date;
  startDay: number;
  endDay: number;
  rowNumber: number;
}

interface ValidatedRoster {
  workbook: ParsedRosterWorkbook;
  assignments: AssignmentPlan[];
  userCount: number;
  shiftCount: number;
  offCount: number;
}

@Injectable()
export class RosterImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rosterExcelService: RosterExcelService,
    private readonly generationService: ScheduleGenerationService,
  ) {}

  async preview(buffer: Buffer) {
    const validated = await this.validateWorkbook(buffer);

    return {
      valid: true,
      siteId: validated.workbook.siteId,
      month: validated.workbook.month,
      year: validated.workbook.year,
      summary: {
        totalSecurity: validated.userCount,
        totalAssignment: validated.assignments.length,
        totalShift: validated.shiftCount,
        totalOff: validated.offCount,
      },
      assignments: validated.assignments.map((item) => ({
        rowNumber: item.rowNumber,
        userId: item.userId,
        userName: item.userName,
        scheduleId: item.scheduleId,
        scheduleName: item.scheduleName,
        startDate: this.formatDate(item.startDate),
        endDate: this.formatDate(item.endDate),
        startDay: item.startDay,
        endDay: item.endDay,
      })),
    };
  }

  async importRoster(buffer: Buffer, createdById: string) {
    if (!createdById) {
      throw new BadRequestException('User pembuat import tidak ditemukan');
    }

    const validated = await this.validateWorkbook(buffer);

    if (validated.assignments.length === 0) {
      throw new BadRequestException(
        'Tidak ada assignment shift yang dapat diimport.',
      );
    }

    // Simpan semua assignment sekaligus.
    const createdAssignments = await this.prisma.$transaction(
      async (tx) => {
        const created = [];

        for (const assignment of validated.assignments) {
          const result = await tx.patrolScheduleAssignment.create({
            data: {
              scheduleId: assignment.scheduleId,
              userId: assignment.userId,
              startDate: assignment.startDate,
              endDate: assignment.endDate,
              status: ScheduleAssignmentStatus.ACTIVE,
              createdById,
            },
            select: {
              id: true,
              scheduleId: true,
              userId: true,
              startDate: true,
              endDate: true,
            },
          });

          created.push(result);
        }

        return created;
      },
      {
        maxWait: 10000,
        timeout: 30000,
      },
    );

    const generationResults: Array<{
      scheduleId: string;
      scheduleName: string;
      success: boolean;
      message: string;
    }> = [];

    const groupedBySchedule = new Map<
      string,
      {
        scheduleName: string;
        startDate: Date;
        endDate: Date;
      }
    >();

    for (const assignment of validated.assignments) {
      const current = groupedBySchedule.get(assignment.scheduleId);

      if (!current) {
        groupedBySchedule.set(assignment.scheduleId, {
          scheduleName: assignment.scheduleName,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
        });
      } else {
        if (assignment.startDate < current.startDate) {
          current.startDate = assignment.startDate;
        }

        if (assignment.endDate > current.endDate) {
          current.endDate = assignment.endDate;
        }
      }
    }

    for (const [scheduleId, group] of groupedBySchedule) {
      try {
        await this.generationService.generate(scheduleId, {
          startDate: this.formatDate(group.startDate),
          endDate: this.formatDate(group.endDate),
        } as Parameters<ScheduleGenerationService['generate']>[1]);

        generationResults.push({
          scheduleId,
          scheduleName: group.scheduleName,
          success: true,
          message: 'Patrol berhasil digenerate',
        });
      } catch (error) {
        generationResults.push({
          scheduleId,
          scheduleName: group.scheduleName,
          success: false,
          message:
            error instanceof Error
              ? error.message
              : 'Gagal melakukan generate patrol',
        });
      }
    }

    const generationFailed = generationResults.filter((item) => !item.success);

    return {
      success: true,
      message:
        generationFailed.length > 0
          ? 'Roster berhasil disimpan, tetapi sebagian generate patrol gagal.'
          : 'Roster berhasil diimport dan patrol berhasil digenerate.',
      summary: {
        siteId: validated.workbook.siteId,
        month: validated.workbook.month,
        year: validated.workbook.year,
        totalSecurity: validated.userCount,
        totalAssignment: createdAssignments.length,
        totalShift: validated.shiftCount,
        totalOff: validated.offCount,
      },
      assignments: createdAssignments,
      generation: {
        success: generationResults.length - generationFailed.length,
        failed: generationFailed.length,
        results: generationResults,
      },
    };
  }

  /**
   * Validasi workbook dan membentuk assignment plan.
   * Tidak ada perubahan database pada method ini.
   */
  private async validateWorkbook(buffer: Buffer): Promise<ValidatedRoster> {
    const workbook = await this.rosterExcelService.parseRoster(buffer);

    const site = await this.prisma.site.findFirst({
      where: {
        id: workbook.siteId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!site) {
      throw new NotFoundException(
        'Site pada template tidak ditemukan atau tidak aktif.',
      );
    }

    const employeeNumbers = [
      ...new Set(
        workbook.rows.map((row) => row.employeeNumber).filter(Boolean),
      ),
    ];

    const usernames = [
      ...new Set(workbook.rows.map((row) => row.username).filter(Boolean)),
    ];

    const userConditions = [];

    if (employeeNumbers.length > 0) {
      userConditions.push({
        employeeNumber: {
          in: employeeNumbers,
        },
      });
    }

    if (usernames.length > 0) {
      userConditions.push({
        username: {
          in: usernames,
        },
      });
    }

    const users = await this.prisma.user.findMany({
      where: {
        siteId: workbook.siteId,
        status: 'ACTIVE',
        deletedAt: null,
        role: {
          name: 'SECURITY',
        },
        OR: userConditions,
      },
      select: {
        id: true,
        employeeNumber: true,
        username: true,
        fullName: true,
      },
    });

    const userByEmployeeNumber = new Map<string, ResolvedRosterUser>();
    const userByUsername = new Map<string, ResolvedRosterUser>();

    for (const user of users) {
      const resolved: ResolvedRosterUser = {
        id: user.id,
        employeeNumber: user.employeeNumber,
        username: user.username,
        fullName: user.fullName,
      };

      if (user.employeeNumber) {
        userByEmployeeNumber.set(user.employeeNumber, resolved);
      }

      userByUsername.set(user.username, resolved);
    }

    const resolvedRows: Array<{
      row: ParsedRosterRow;
      user: ResolvedRosterUser;
    }> = [];

    const seenUsers = new Set<string>();

    for (const row of workbook.rows) {
      const userByNumber = row.employeeNumber
        ? userByEmployeeNumber.get(row.employeeNumber)
        : undefined;

      const userByUserName = row.username
        ? userByUsername.get(row.username)
        : undefined;

      if (
        userByNumber &&
        userByUserName &&
        userByNumber.id !== userByUserName.id
      ) {
        throw new BadRequestException(
          `Baris ${row.rowNumber}: Employee Number dan Username mengarah ke dua satpam berbeda.`,
        );
      }

      const user = userByNumber ?? userByUserName;

      if (!user) {
        throw new BadRequestException(
          `Baris ${row.rowNumber}: Satpam "${row.fullName || row.username || row.employeeNumber}" tidak ditemukan, tidak aktif, atau bukan anggota site ini.`,
        );
      }

      if (seenUsers.has(user.id)) {
        throw new BadRequestException(
          `Satpam ${user.fullName} muncul lebih dari satu kali pada Excel.`,
        );
      }

      seenUsers.add(user.id);

      resolvedRows.push({
        row,
        user,
      });
    }

    // Validasi schedule yang dirujuk oleh sheet Referensi Shift.
    const referencedScheduleIds = [
      ...new Set(
        workbook.shifts
          .filter((shift) => shift.code !== 'OFF' && shift.scheduleId !== null)
          .map((shift) => shift.scheduleId as string),
      ),
    ];

    const schedules = await this.prisma.patrolSchedule.findMany({
      where: {
        id: {
          in: referencedScheduleIds,
        },
        siteId: workbook.siteId,
        status: ScheduleStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        startTime: true,
        endTime: true,
      },
    });

    const scheduleMap = new Map(
      schedules.map((schedule) => [schedule.id, schedule]),
    );

    const shiftMap = new Map<
      RosterShiftCode,
      {
        scheduleId: string;
        scheduleName: string;
      }
    >();

    for (const shift of workbook.shifts) {
      if (shift.code === 'OFF') {
        continue;
      }

      if (!shift.scheduleId) {
        continue;
      }

      const schedule = scheduleMap.get(shift.scheduleId);

      if (!schedule) {
        throw new BadRequestException(
          `Schedule untuk shift ${shift.code} tidak ditemukan, tidak aktif, atau bukan milik site ${site.name}.`,
        );
      }

      if (
        schedule.name !== shift.scheduleName ||
        schedule.startTime !== shift.startTime ||
        schedule.endTime !== shift.endTime
      ) {
        throw new BadRequestException(
          `Referensi shift ${shift.code} telah berubah. Download template terbaru sebelum import.`,
        );
      }

      shiftMap.set(shift.code, {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
      });
    }

    const assignments: AssignmentPlan[] = [];

    let shiftCount = 0;
    let offCount = 0;

    for (const { row, user } of resolvedRows) {
      const segments = this.buildSegments(
        row,
        user,
        shiftMap,
        workbook.month,
        workbook.year,
      );

      for (const segment of segments.assignments) {
        assignments.push(segment);
      }

      shiftCount += segments.shiftCount;
      offCount += segments.offCount;
    }

    await this.validateAssignmentOverlaps(
      assignments,
      workbook.month,
      workbook.year,
    );

    return {
      workbook,
      assignments,
      userCount: resolvedRows.length,
      shiftCount,
      offCount,
    };
  }

  /**
   * Menggabungkan tanggal berurutan dengan schedule yang sama
   * menjadi satu assignment.
   */
  private buildSegments(
    row: ParsedRosterRow,
    user: ResolvedRosterUser,
    shiftMap: Map<
      RosterShiftCode,
      {
        scheduleId: string;
        scheduleName: string;
      }
    >,
    month: number,
    year: number,
  ): {
    assignments: AssignmentPlan[];
    shiftCount: number;
    offCount: number;
  } {
    const daysInMonth = new Date(year, month, 0).getDate();

    const assignments: AssignmentPlan[] = [];

    let shiftCount = 0;
    let offCount = 0;

    let current:
      | {
          scheduleId: string;
          scheduleName: string;
          startDay: number;
          endDay: number;
        }
      | undefined;

    const flush = () => {
      if (!current) {
        return;
      }

      assignments.push({
        userId: user.id,
        userName: user.fullName,
        scheduleId: current.scheduleId,
        scheduleName: current.scheduleName,
        startDate: this.createDate(year, month, current.startDay),
        endDate: this.createDate(year, month, current.endDay),
        startDay: current.startDay,
        endDay: current.endDay,
        rowNumber: row.rowNumber,
      });

      current = undefined;
    };

    for (let day = 1; day <= daysInMonth; day++) {
      const code = row.shifts[day];

      if (!code || code === 'OFF') {
        offCount++;
        flush();
        continue;
      }

      const shift = shiftMap.get(code);

      if (!shift) {
        throw new BadRequestException(
          `Baris ${row.rowNumber}, tanggal ${day}: schedule untuk shift ${code} tidak tersedia.`,
        );
      }

      shiftCount++;

      if (
        current &&
        current.scheduleId === shift.scheduleId &&
        current.endDay === day - 1
      ) {
        current.endDay = day;
        continue;
      }

      flush();

      current = {
        scheduleId: shift.scheduleId,
        scheduleName: shift.scheduleName,
        startDay: day,
        endDay: day,
      };
    }

    flush();

    return {
      assignments,
      shiftCount,
      offCount,
    };
  }

  /**
   * Memeriksa bentrok terhadap semua assignment aktif
   * milik satpam, bukan hanya schedule yang sama.
   */
  private async validateAssignmentOverlaps(
    assignments: AssignmentPlan[],
    month: number,
    year: number,
  ): Promise<void> {
    if (assignments.length === 0) {
      return;
    }

    const userIds = [...new Set(assignments.map((item) => item.userId))];

    const monthStart = this.createDate(year, month, 1);
    const monthEnd = this.createDate(
      year,
      month,
      new Date(year, month, 0).getDate(),
    );

    const existingAssignments =
      await this.prisma.patrolScheduleAssignment.findMany({
        where: {
          userId: {
            in: userIds,
          },
          status: ScheduleAssignmentStatus.ACTIVE,
          startDate: {
            lte: monthEnd,
          },
          OR: [
            {
              endDate: null,
            },
            {
              endDate: {
                gte: monthStart,
              },
            },
          ],
        },
        select: {
          id: true,
          userId: true,
          scheduleId: true,
          startDate: true,
          endDate: true,
          schedule: {
            select: {
              name: true,
            },
          },
          user: {
            select: {
              fullName: true,
            },
          },
        },
      });

    for (const planned of assignments) {
      const conflict = existingAssignments.find((existing) => {
        if (existing.userId !== planned.userId) {
          return false;
        }

        const existingEnd =
          existing.endDate ?? new Date('9999-12-31T00:00:00.000Z');

        return (
          planned.startDate <= existingEnd &&
          planned.endDate >= existing.startDate
        );
      });

      if (conflict) {
        throw new BadRequestException(
          `Bentrok jadwal: ${planned.userName} pada tanggal ${this.formatDate(planned.startDate)} sampai ${this.formatDate(planned.endDate)}. Satpam sudah memiliki assignment "${conflict.schedule.name}" dari ${this.formatDate(conflict.startDate)} sampai ${conflict.endDate ? this.formatDate(conflict.endDate) : 'seterusnya'}.`,
        );
      }
    }

    // Pemeriksaan tambahan jika ada dua assignment import yang bertumpuk.
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const first = assignments[i];
        const second = assignments[j];

        if (first.userId !== second.userId) {
          continue;
        }

        if (
          first.startDate <= second.endDate &&
          first.endDate >= second.startDate
        ) {
          throw new BadRequestException(
            `Bentrok jadwal pada file Excel untuk satpam ${first.userName}, baris ${first.rowNumber} dan ${second.rowNumber}.`,
          );
        }
      }
    }
  }

  private createDate(year: number, month: number, day: number): Date {
    return new Date(Date.UTC(year, month - 1, day));
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
