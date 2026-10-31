import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service.js';

export type RosterShiftCode = 'P' | 'S' | 'M' | 'OFF';

export interface RosterShiftReference {
  code: RosterShiftCode;
  scheduleId: string | null;
  scheduleName: string;
  startTime: string | null;
  endTime: string | null;
}

export interface ParsedRosterRow {
  rowNumber: number;
  employeeNumber: string;
  username: string;
  fullName: string;
  shifts: Record<number, RosterShiftCode>;
}

export interface ParsedRosterWorkbook {
  siteId: string;
  month: number;
  year: number;
  shifts: RosterShiftReference[];
  rows: ParsedRosterRow[];
}

@Injectable()
export class RosterExcelService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly rosterSheetName = 'Roster';
  private readonly referenceSheetName = 'Referensi Shift';

  async createTemplate(
    siteId: string,
    month: number,
    year: number,
  ): Promise<Buffer> {
    this.validatePeriod(month, year);

    const site = await this.prisma.site.findFirst({
      where: {
        id: siteId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!site) {
      throw new NotFoundException('Site tidak ditemukan atau tidak aktif');
    }

    const [users, schedules] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          siteId,
          status: 'ACTIVE',
          deletedAt: null,
          role: {
            name: 'SECURITY',
          },
        },
        select: {
          employeeNumber: true,
          username: true,
          fullName: true,
        },
        orderBy: {
          fullName: 'asc',
        },
      }),

      this.prisma.patrolSchedule.findMany({
        where: {
          siteId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
        },
        orderBy: {
          startTime: 'asc',
        },
      }),
    ]);

    const shiftReferences = this.buildShiftReferences(schedules);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'PAMAREA';
    workbook.subject = 'Template roster satpam bulanan';
    workbook.title = `Roster ${site.name} ${month}-${year}`;
    workbook.created = new Date();

    const roster = workbook.addWorksheet(this.rosterSheetName);

    roster.getColumn(1).width = 20;
    roster.getColumn(2).width = 22;
    roster.getColumn(3).width = 30;

    roster.mergeCells('A1:D1');
    roster.getCell('A1').value = 'PAMAREA - ROSTER SATPAM';
    roster.getCell('A1').font = {
      bold: true,
      size: 16,
    };

    roster.getCell('A2').value = 'Site ID';
    roster.getCell('B2').value = site.id;

    roster.getCell('A3').value = 'Site';
    roster.getCell('B3').value = `${site.code} - ${site.name}`;

    roster.getCell('A4').value = 'Bulan';
    roster.getCell('B4').value = month;

    roster.getCell('C4').value = 'Tahun';
    roster.getCell('D4').value = year;

    roster.getCell('A5').value = 'Employee Number';
    roster.getCell('B5').value = 'Username';
    roster.getCell('C5').value = 'Nama Satpam';

    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const column = day + 3;
      roster.getCell(5, column).value = day;
      roster.getColumn(column).width = 8;
    }

    const header = roster.getRow(5);
    header.font = {
      bold: true,
      color: {
        argb: 'FFFFFFFF',
      },
    };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: 'FF17365D',
      },
    };
    header.alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };

    users.forEach((user, index) => {
      const rowNumber = index + 6;

      roster.getCell(rowNumber, 1).value = user.employeeNumber ?? '';
      roster.getCell(rowNumber, 2).value = user.username;
      roster.getCell(rowNumber, 3).value = user.fullName;

      for (let day = 1; day <= daysInMonth; day++) {
        const cell = roster.getCell(rowNumber, day + 3);
        cell.value = 'OFF';
        cell.alignment = {
          horizontal: 'center',
          vertical: 'middle',
        };
      }
    });

    roster.views = [
      {
        state: 'frozen',
        xSplit: 3,
        ySplit: 5,
      },
    ];

    roster.autoFilter = {
      from: 'A5',
      to: roster.getCell(5, daysInMonth + 3).address,
    };

    const reference = workbook.addWorksheet(this.referenceSheetName);

    reference.columns = [
      { header: 'Kode', key: 'code', width: 12 },
      { header: 'Nama Shift', key: 'name', width: 25 },
      { header: 'Schedule ID', key: 'scheduleId', width: 40 },
      { header: 'Jam Mulai', key: 'startTime', width: 15 },
      { header: 'Jam Selesai', key: 'endTime', width: 15 },
    ];

    for (const shift of shiftReferences) {
      reference.addRow({
        code: shift.code,
        name: shift.scheduleName,
        scheduleId: shift.scheduleId ?? '',
        startTime: shift.startTime ?? '',
        endTime: shift.endTime ?? '',
      });
    }

    reference.addRow({
      code: 'OFF',
      name: 'Libur',
      scheduleId: '',
      startTime: '',
      endTime: '',
    });

    reference.getRow(1).font = {
      bold: true,
      color: {
        argb: 'FFFFFFFF',
      },
    };

    reference.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: 'FF17365D',
      },
    };

    const instructions = workbook.addWorksheet('Petunjuk');

    instructions.addRows([
      ['PETUNJUK PENGISIAN ROSTER'],
      ['1. Isi shift setiap satpam pada sheet Roster.'],
      ['2. Gunakan kode P untuk Pagi.'],
      ['3. Gunakan kode S untuk Siang.'],
      ['4. Gunakan kode M untuk Malam.'],
      ['5. Gunakan OFF untuk hari libur.'],
      ['6. Jangan mengubah Employee Number dan Username.'],
      ['7. Jangan mengubah Site ID, bulan, dan tahun.'],
      ['8. Jangan mengubah sheet Referensi Shift.'],
      ['9. Setiap satpam hanya boleh memiliki satu shift per hari.'],
      ['10. Pastikan tidak ada jadwal aktif yang bertabrakan.'],
    ]);

    instructions.getColumn(1).width = 75;
    instructions.getCell('A1').font = {
      bold: true,
      size: 14,
    };

    const buffer = await workbook.xlsx.writeBuffer();

    return Buffer.from(buffer);
  }

  async parseRoster(buffer: Buffer): Promise<ParsedRosterWorkbook> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('File Excel kosong');
    }

    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException(
        'File tidak valid. Gunakan file template Excel PAMAREA.',
      );
    }

    const roster = workbook.getWorksheet(this.rosterSheetName);
    const reference = workbook.getWorksheet(this.referenceSheetName);

    if (!roster || !reference) {
      throw new BadRequestException(
        'Sheet Roster atau Referensi Shift tidak ditemukan',
      );
    }

    const siteId = this.getCellText(roster.getCell('B2').value);
    const month = Number(roster.getCell('B4').value);
    const year = Number(roster.getCell('D4').value);

    this.validatePeriod(month, year);

    if (!siteId) {
      throw new BadRequestException('Site ID pada template tidak ditemukan');
    }

    const shifts = this.parseShiftReferences(reference);
    const shiftCodes = new Set(shifts.map((item) => item.code));

    const headerRow = roster.getRow(5);
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const headerValue = headerRow.getCell(day + 3).value;

      if (Number(headerValue) !== day) {
        throw new BadRequestException(
          `Header tanggal ${day} tidak sesuai. Jangan mengubah kolom tanggal.`,
        );
      }
    }

    const rows: ParsedRosterRow[] = [];

    for (let rowNumber = 6; rowNumber <= roster.rowCount; rowNumber++) {
      const row = roster.getRow(rowNumber);

      const employeeNumber = this.getCellText(row.getCell(1).value);
      const username = this.getCellText(row.getCell(2).value);
      const fullName = this.getCellText(row.getCell(3).value);

      const hasIdentity = employeeNumber || username || fullName;

      if (!hasIdentity) {
        continue;
      }

      if (!employeeNumber && !username) {
        throw new BadRequestException(
          `Baris ${rowNumber}: Employee Number atau Username wajib diisi.`,
        );
      }

      const rowShifts: Record<number, RosterShiftCode> = {};

      for (let day = 1; day <= daysInMonth; day++) {
        const rawValue = this.getCellText(
          row.getCell(day + 3).value,
        ).toUpperCase();

        const code = (rawValue || 'OFF') as RosterShiftCode;

        if (!shiftCodes.has(code)) {
          throw new BadRequestException(
            `Baris ${rowNumber}, tanggal ${day}: kode shift "${rawValue}" tidak valid.`,
          );
        }

        rowShifts[day] = code;
      }

      rows.push({
        rowNumber,
        employeeNumber,
        username,
        fullName,
        shifts: rowShifts,
      });
    }

    if (rows.length === 0) {
      throw new BadRequestException('Tidak ada data satpam pada template');
    }

    return {
      siteId,
      month,
      year,
      shifts,
      rows,
    };
  }

  private parseShiftReferences(
    worksheet: ExcelJS.Worksheet,
  ): RosterShiftReference[] {
    const result: RosterShiftReference[] = [];

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      const code = this.getCellText(row.getCell(1).value).toUpperCase();

      if (!code) {
        continue;
      }

      if (!['P', 'S', 'M', 'OFF'].includes(code)) {
        throw new BadRequestException(
          `Referensi shift baris ${rowNumber}: kode "${code}" tidak dikenal.`,
        );
      }

      result.push({
        code: code as RosterShiftCode,
        scheduleName: this.getCellText(row.getCell(2).value),
        scheduleId: this.getCellText(row.getCell(3).value) || null,
        startTime: this.getCellText(row.getCell(4).value) || null,
        endTime: this.getCellText(row.getCell(5).value) || null,
      });
    }

    if (!result.some((item) => item.code === 'OFF')) {
      result.push({
        code: 'OFF',
        scheduleId: null,
        scheduleName: 'Libur',
        startTime: null,
        endTime: null,
      });
    }

    for (const code of ['P', 'S', 'M'] as const) {
      const count = result.filter((item) => item.code === code).length;

      if (count > 1) {
        throw new BadRequestException(
          `Referensi shift memiliki lebih dari satu schedule untuk kode ${code}.`,
        );
      }
    }

    return result;
  }

  private buildShiftReferences(
    schedules: Array<{
      id: string;
      name: string;
      startTime: string;
      endTime: string;
    }>,
  ): RosterShiftReference[] {
    const result: RosterShiftReference[] = [];

    for (const schedule of schedules) {
      const code = this.detectShiftCode(schedule.name, schedule.startTime);

      if (!code) {
        continue;
      }

      if (result.some((item) => item.code === code)) {
        throw new BadRequestException(
          `Terdapat lebih dari satu schedule aktif untuk shift ${code}. Periksa nama dan jam schedule.`,
        );
      }

      result.push({
        code,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      });
    }

    result.push({
      code: 'OFF',
      scheduleId: null,
      scheduleName: 'Libur',
      startTime: null,
      endTime: null,
    });

    return result;
  }

  private detectShiftCode(
    name: string,
    startTime: string,
  ): 'P' | 'S' | 'M' | null {
    const normalized = name.toLowerCase();

    if (/pagi|morning/.test(normalized)) {
      return 'P';
    }

    if (/siang|sore|afternoon/.test(normalized)) {
      return 'S';
    }

    if (/malam|night|overnight/.test(normalized)) {
      return 'M';
    }

    const hour = Number(startTime.split(':')[0]);

    if (!Number.isFinite(hour)) {
      return null;
    }

    if (hour >= 5 && hour < 11) {
      return 'P';
    }

    if (hour >= 11 && hour < 18) {
      return 'S';
    }

    return 'M';
  }

  private validatePeriod(month: number, year: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Bulan harus antara 1 sampai 12');
    }

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new BadRequestException('Tahun tidak valid');
    }
  }

  private getCellText(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object' && 'text' in value) {
      return String(value.text ?? '').trim();
    }

    if (typeof value === 'object' && 'result' in value) {
      return String(value.result ?? '').trim();
    }

    return String(value).trim();
  }
}
