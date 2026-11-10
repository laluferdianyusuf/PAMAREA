import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { readFile } from 'fs/promises';
import JSZip from 'jszip';
import { extname, resolve, sep } from 'path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExportPatrolHistoryDto } from './dto/export-patrol-history.dto.js';

type PhotoResult = {
  base64: string;
  extension: 'jpeg' | 'png';
};

type PhotoTask = {
  rowIndex: number;
  columnIndex: number;
  fileUrl: string;
  worksheet: ExcelJS.Worksheet;
};

@Injectable()
export class PatrolHistoryExportService {
  private readonly logger = new Logger(PatrolHistoryExportService.name);

  private readonly colors = {
    navy: 'FF17365D',
    blue: 'FF2563EB',
    lightBlue: 'FFEFF6FF',
    white: 'FFFFFFFF',
    text: 'FF1E293B',
    muted: 'FF64748B',
    border: 'FFE2E8F0',
    alternate: 'FFF8FAFC',
    green: 'FF15803D',
    lightGreen: 'FFDCFCE7',
    red: 'FFBE123C',
    lightRed: 'FFFFE4E6',
    amber: 'FFB45309',
    lightAmber: 'FFFEF3C7',
    gray: 'FF475569',
    lightGray: 'FFF1F5F9',
  };

  private readonly photoCache = new Map<string, Promise<PhotoResult | null>>();

  constructor(private readonly prisma: PrismaService) {}

  async export(dto: ExportPatrolHistoryDto): Promise<Buffer> {
    this.photoCache.clear();

    const startDate = this.parseWitaDate(dto.startDate, false);
    const endDateExclusive = this.parseWitaDate(dto.endDate, true);

    if (startDate >= endDateExclusive) {
      throw new BadRequestException(
        'Tanggal awal tidak boleh melebihi tanggal akhir',
      );
    }

    const search = dto.search?.trim();

    const where = {
      status: 'SUBMITTED' as const,
      startedAt: {
        gte: startDate,
        lt: endDateExclusive,
      },
      ...(dto.siteId && dto.siteId !== 'all' ? { siteId: dto.siteId } : {}),
      ...(search
        ? {
            OR: [
              {
                reportNumber: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                user: {
                  fullName: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                user: {
                  employeeNumber: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                user: {
                  username: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const patrols = await this.prisma.patrol.findMany({
      where,
      select: {
        id: true,
        reportNumber: true,
        startedAt: true,
        completedAt: true,
        status: true,
        gpsValidationStatus: true,
        gpsAccuracy: true,
        distanceFromPoint: true,
        nfcValidationStatus: true,
        nfcBypass: true,
        nfcBypassReason: true,
        nfcBypassNote: true,

        user: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            username: true,
          },
        },

        site: {
          select: {
            id: true,
            name: true,
          },
        },

        patrolPoint: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },

        checkpoint: {
          select: {
            id: true,
            sequence: true,
            status: true,
          },
        },

        answers: {
          select: {
            id: true,
            questionTextSnapshot: true,
            answerValue: true,
            answerLabelSnapshot: true,
            photos: {
              select: {
                id: true,
                fileUrl: true,
                mimeType: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },

        findings: {
          select: {
            id: true,
            title: true,
            description: true,
            severity: true,
            status: true,
            resolutionNote: true,
            resolvedAt: true,
            createdAt: true,
            patrolPoint: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            photos: {
              select: {
                id: true,
                fileUrl: true,
                mimeType: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (patrols.length === 0) {
      throw new BadRequestException(
        'Tidak ada data patroli untuk filter yang dipilih',
      );
    }

    const timestamp = this.getWitaDateKey(new Date());
    const exportedAt = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Makassar',
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date());

    const siteName =
      dto.siteId && dto.siteId !== 'all' ? patrols[0].site.name : 'Semua Site';

    const subtitle = `PAMAREA | ${siteName} | Diekspor ${exportedAt}`;

    const historyWorkbook = this.createWorkbook(
      'Riwayat Patroli',
      'Laporan pelaksanaan patroli',
    );

    const answerWorkbook = this.createWorkbook(
      'Jawaban Patroli',
      'Laporan jawaban pertanyaan patroli beserta dokumentasi',
    );

    const findingWorkbook = this.createWorkbook(
      'Temuan Patroli',
      'Laporan temuan patroli beserta dokumentasi',
    );

    const historySheet = historyWorkbook.addWorksheet('Riwayat Patroli');
    const answerSheet = answerWorkbook.addWorksheet('Jawaban');
    const findingSheet = findingWorkbook.addWorksheet('Temuan');

    this.buildHistorySheet(historySheet, patrols, subtitle);
    const answerPhotoTasks = this.buildAnswerSheet(
      answerSheet,
      patrols,
      subtitle,
    );
    const findingPhotoTasks = this.buildFindingSheet(
      findingSheet,
      patrols,
      subtitle,
    );

    await this.embedPhotos(answerWorkbook, answerPhotoTasks);
    await this.embedPhotos(findingWorkbook, findingPhotoTasks);

    const zip = new JSZip();

    const [historyBuffer, answerBuffer, findingBuffer] = await Promise.all([
      historyWorkbook.xlsx.writeBuffer(),
      answerWorkbook.xlsx.writeBuffer(),
      findingWorkbook.xlsx.writeBuffer(),
    ]);

    zip.file(
      `01-Riwayat-Patroli-${timestamp}.xlsx`,
      Buffer.from(historyBuffer),
    );

    zip.file(`02-Jawaban-Patroli-${timestamp}.xlsx`, Buffer.from(answerBuffer));

    zip.file(`03-Temuan-Patroli-${timestamp}.xlsx`, Buffer.from(findingBuffer));

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'STORE',
    });

    this.logger.log(
      `Export selesai: ${patrols.length} patroli, ${answerPhotoTasks.length} foto jawaban, ${findingPhotoTasks.length} foto temuan`,
    );

    return zipBuffer;
  }

  private parseWitaDate(value: string, exclusiveEnd: boolean): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException('Format tanggal harus YYYY-MM-DD');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('Tanggal tidak valid');
    }

    if (exclusiveEnd) {
      date.setUTCDate(date.getUTCDate() + 1);
    }

    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        -8,
        0,
        0,
        0,
      ),
    );
  }

  private getWitaDateKey(value: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Makassar',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);

    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    return `${values.year}-${values.month}-${values.day}`;
  }

  private createWorkbook(title: string, subject: string) {
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'PAMAREA';
    workbook.subject = subject;
    workbook.title = title;
    workbook.created = new Date();
    workbook.modified = new Date();

    return workbook;
  }

  private styleWorksheet(
    worksheet: ExcelJS.Worksheet,
    title: string,
    subtitle: string,
  ) {
    const lastColumn = worksheet.columns.length;

    worksheet.spliceRows(1, 0, [], [], []);
    worksheet.mergeCells(1, 1, 1, lastColumn);
    worksheet.mergeCells(2, 1, 2, lastColumn);

    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = {
      name: 'Aptos Display',
      size: 18,
      bold: true,
      color: { argb: this.colors.white },
    };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: this.colors.navy },
    };
    titleCell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      indent: 1,
    };

    const subtitleCell = worksheet.getCell(2, 1);
    subtitleCell.value = subtitle;
    subtitleCell.font = {
      name: 'Aptos',
      size: 10,
      italic: true,
      color: { argb: this.colors.muted },
    };
    subtitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: this.colors.lightBlue },
    };
    subtitleCell.alignment = {
      vertical: 'middle',
      indent: 1,
    };

    worksheet.getRow(1).height = 38;
    worksheet.getRow(2).height = 25;
    worksheet.getRow(3).height = 10;

    const header = worksheet.getRow(4);
    header.height = 34;

    header.eachCell((cell) => {
      cell.font = {
        name: 'Aptos',
        size: 10,
        bold: true,
        color: { argb: this.colors.white },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.colors.navy },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.border = {
        bottom: {
          style: 'medium',
          color: { argb: this.colors.blue },
        },
      };
    });

    worksheet.views = [
      {
        state: 'frozen',
        ySplit: 4,
      },
    ];

    worksheet.properties.defaultRowHeight = 25;
    worksheet.properties.showGridLines = false;
    worksheet.autoFilter = {
      from: {
        row: 4,
        column: 1,
      },
      to: {
        row: 4,
        column: lastColumn,
      },
    };

    worksheet.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    };
  }

  private styleDataRows(worksheet: ExcelJS.Worksheet, startRow = 5) {
    for (
      let rowNumber = startRow;
      rowNumber <= worksheet.rowCount;
      rowNumber++
    ) {
      const row = worksheet.getRow(rowNumber);
      row.height = 25;

      row.eachCell((cell) => {
        cell.font = {
          name: 'Aptos',
          size: 10,
          color: { argb: this.colors.text },
        };

        cell.alignment = {
          vertical: 'middle',
          wrapText: true,
        };

        cell.border = {
          bottom: {
            style: 'thin',
            color: { argb: this.colors.border },
          },
        };

        if (rowNumber % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: this.colors.alternate },
          };
        }
      });
    }
  }

  private styleStatus(cell: ExcelJS.Cell, status: string | null | undefined) {
    const value = String(status ?? '').toUpperCase();

    let fontColor = this.colors.gray;
    let fillColor = this.colors.lightGray;

    if (
      ['SUBMITTED', 'SELESAI', 'COMPLETED', 'RESOLVED', 'VALID'].includes(value)
    ) {
      fontColor = this.colors.green;
      fillColor = this.colors.lightGreen;
    } else if (
      [
        'FAILED',
        'GAGAL',
        'INVALID',
        'MISSED',
        'CANCELLED',
        'DIBATALKAN',
      ].includes(value)
    ) {
      fontColor = this.colors.red;
      fillColor = this.colors.lightRed;
    } else if (
      ['IN_PROGRESS', 'BERLANGSUNG', 'OPEN', 'PENDING'].includes(value)
    ) {
      fontColor = this.colors.amber;
      fillColor = this.colors.lightAmber;
    }

    cell.font = {
      name: 'Aptos',
      size: 9,
      bold: true,
      color: { argb: fontColor },
    };

    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: fillColor },
    };

    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
  }

  private formatDuration(
    startedAt: Date | null,
    completedAt: Date | null,
  ): string {
    if (!startedAt || !completedAt) return '-';

    const milliseconds =
      new Date(completedAt).getTime() - new Date(startedAt).getTime();

    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      return '-';
    }

    const minutes = Math.floor(milliseconds / 60000);

    if (minutes < 60) {
      return `${minutes} menit`;
    }

    return `${Math.floor(minutes / 60)} jam ${minutes % 60} menit`;
  }

  private getStatusLabel(status: string | null | undefined): string {
    const labels: Record<string, string> = {
      STARTED: 'Dimulai',
      VALIDATED: 'Tervalidasi',
      IN_PROGRESS: 'Berlangsung',
      SUBMITTED: 'Selesai',
      FAILED: 'Gagal',
      CANCELLED: 'Dibatalkan',
    };

    return status ? (labels[status] ?? status) : '-';
  }

  private buildHistorySheet(
    worksheet: ExcelJS.Worksheet,
    patrols: any[],
    subtitle: string,
  ) {
    worksheet.columns = [
      { header: 'No.', key: 'no', width: 8 },
      { header: 'ID Sesi', key: 'reportNumber', width: 24 },
      { header: 'Site', key: 'site', width: 22 },
      { header: 'Kode Titik', key: 'pointCode', width: 16 },
      { header: 'Titik Patroli', key: 'pointName', width: 25 },
      { header: 'NPP Security', key: 'employeeNumber', width: 18 },
      { header: 'Nama Security', key: 'security', width: 25 },
      { header: 'Urutan Titik', key: 'sequence', width: 14 },
      { header: 'Waktu Mulai', key: 'startedAt', width: 22 },
      { header: 'Waktu Selesai', key: 'completedAt', width: 22 },
      { header: 'Durasi', key: 'duration', width: 18 },
      { header: 'Status GPS', key: 'gps', width: 16 },
      { header: 'Akurasi GPS (m)', key: 'accuracy', width: 17 },
      { header: 'Jarak Titik (m)', key: 'distance', width: 17 },
      { header: 'Status NFC', key: 'nfc', width: 18 },
      { header: 'NFC Bypass', key: 'nfcBypass', width: 14 },
      { header: 'Alasan Bypass', key: 'nfcReason', width: 22 },
      { header: 'Catatan Bypass', key: 'nfcNote', width: 28 },
      { header: 'Status Checkpoint', key: 'checkpointStatus', width: 20 },
      { header: 'Status Patroli', key: 'status', width: 18 },
    ];

    worksheet.addRow({});
    this.styleWorksheet(worksheet, 'LAPORAN RIWAYAT PATROLI', subtitle);

    patrols.forEach((patrol, index) => {
      worksheet.addRow({
        no: index + 1,
        reportNumber: patrol.reportNumber ?? '-',
        site: patrol.site?.name ?? '-',
        pointCode: patrol.patrolPoint?.code ?? '-',
        pointName: patrol.patrolPoint?.name ?? '-',
        employeeNumber: patrol.user?.employeeNumber ?? '-',
        security: patrol.user?.fullName ?? '-',
        sequence: patrol.checkpoint?.sequence ?? '-',
        startedAt: patrol.startedAt ?? null,
        completedAt: patrol.completedAt ?? null,
        duration: this.formatDuration(patrol.startedAt, patrol.completedAt),
        gps: patrol.gpsValidationStatus ?? '-',
        accuracy: patrol.gpsAccuracy ?? null,
        distance: patrol.distanceFromPoint ?? null,
        nfc: patrol.nfcValidationStatus ?? '-',
        nfcBypass: patrol.nfcBypass ? 'Ya' : 'Tidak',
        nfcReason: patrol.nfcBypassReason ?? '-',
        nfcNote: patrol.nfcBypassNote ?? '-',
        checkpointStatus: patrol.checkpoint?.status ?? '-',
        status: this.getStatusLabel(patrol.status),
      });
    });

    this.styleDataRows(worksheet);

    for (let row = 5; row <= worksheet.rowCount; row++) {
      const patrol = patrols[row - 5];

      worksheet.getCell(row, 9).numFmt = 'dd mmm yyyy hh:mm';
      worksheet.getCell(row, 10).numFmt = 'dd mmm yyyy hh:mm';
      worksheet.getCell(row, 13).numFmt = '0.00';
      worksheet.getCell(row, 14).numFmt = '0.00';

      this.styleStatus(worksheet.getCell(row, 12), patrol.gpsValidationStatus);

      this.styleStatus(worksheet.getCell(row, 15), patrol.nfcValidationStatus);

      this.styleStatus(worksheet.getCell(row, 19), patrol.checkpoint?.status);

      this.styleStatus(worksheet.getCell(row, 20), patrol.status);
    }
  }

  private buildAnswerSheet(
    worksheet: ExcelJS.Worksheet,
    patrols: any[],
    subtitle: string,
  ): PhotoTask[] {
    const answers = patrols.flatMap((patrol) =>
      patrol.answers.map((answer: any) => ({
        reportNumber: patrol.reportNumber,
        site: patrol.site?.name ?? '-',
        employeeNumber: patrol.user?.employeeNumber ?? '-',
        security: patrol.user?.fullName ?? '-',
        startedAt: patrol.startedAt,
        point: patrol.patrolPoint?.name ?? '-',
        question: answer.questionTextSnapshot ?? '-',
        answer: answer.answerLabelSnapshot ?? answer.answerValue ?? '-',
        photos: answer.photos ?? [],
      })),
    );

    const maxPhotos = Math.max(
      1,
      ...answers.map((answer) => answer.photos.length),
    );

    const columns: Partial<ExcelJS.Column>[] = [
      { header: 'No.', key: 'no', width: 8 },
      { header: 'ID Sesi', key: 'reportNumber', width: 24 },
      { header: 'Site', key: 'site', width: 22 },
      { header: 'NPP Security', key: 'employeeNumber', width: 18 },
      { header: 'Nama Security', key: 'security', width: 25 },
      { header: 'Waktu Patroli', key: 'startedAt', width: 22 },
      { header: 'Titik Patroli', key: 'point', width: 25 },
      { header: 'Pertanyaan', key: 'question', width: 42 },
      { header: 'Jawaban', key: 'answer', width: 30 },
      { header: 'Jumlah Foto', key: 'photoCount', width: 14 },
    ];

    for (let index = 1; index <= maxPhotos; index++) {
      columns.push({
        header: `Foto ${index}`,
        key: `photo${index}`,
        width: 20,
      });
    }

    worksheet.columns = columns;
    worksheet.addRow({});
    this.styleWorksheet(worksheet, 'LAPORAN JAWABAN PATROLI', subtitle);

    const tasks: PhotoTask[] = [];

    answers.forEach((answer, index) => {
      const row: Record<string, unknown> = {
        no: index + 1,
        reportNumber: answer.reportNumber,
        site: answer.site,
        employeeNumber: answer.employeeNumber,
        security: answer.security,
        startedAt: answer.startedAt,
        point: answer.point,
        question: answer.question,
        answer: answer.answer,
        photoCount: answer.photos.length,
      };

      for (let photoIndex = 0; photoIndex < maxPhotos; photoIndex++) {
        row[`photo${photoIndex + 1}`] = '';

        const photo = answer.photos[photoIndex];

        if (photo?.fileUrl) {
          tasks.push({
            rowIndex: index + 5,
            columnIndex: 10 + photoIndex,
            fileUrl: photo.fileUrl,
            worksheet,
          });
        }
      }

      worksheet.addRow(row);
    });

    this.styleDataRows(worksheet);

    for (let row = 5; row <= worksheet.rowCount; row++) {
      worksheet.getCell(row, 6).numFmt = 'dd mmm yyyy hh:mm';
    }

    return tasks;
  }

  private buildFindingSheet(
    worksheet: ExcelJS.Worksheet,
    patrols: any[],
    subtitle: string,
  ): PhotoTask[] {
    const findings = patrols.flatMap((patrol) =>
      patrol.findings.map((finding: any) => ({
        reportNumber: patrol.reportNumber,
        site: patrol.site?.name ?? '-',
        employeeNumber: patrol.user?.employeeNumber ?? '-',
        security: patrol.user?.fullName ?? '-',
        point: finding.patrolPoint?.name ?? patrol.patrolPoint?.name ?? '-',
        pointCode: finding.patrolPoint?.code ?? patrol.patrolPoint?.code ?? '-',
        sequence: patrol.checkpoint?.sequence ?? '-',
        startedAt: patrol.startedAt,
        title: finding.title,
        description: finding.description ?? '-',
        severity: finding.severity,
        status: finding.status,
        resolutionNote: finding.resolutionNote ?? '-',
        resolvedAt: finding.resolvedAt,
        photos: finding.photos ?? [],
      })),
    );

    const maxPhotos = Math.max(
      1,
      ...findings.map((finding) => finding.photos.length),
    );

    const columns: Partial<ExcelJS.Column>[] = [
      { header: 'No.', key: 'no', width: 8 },
      { header: 'ID Sesi', key: 'reportNumber', width: 24 },
      { header: 'Site', key: 'site', width: 22 },
      { header: 'NPP Security', key: 'employeeNumber', width: 18 },
      { header: 'Nama Security', key: 'security', width: 25 },
      { header: 'Titik Patroli', key: 'point', width: 25 },
      { header: 'Kode Titik', key: 'pointCode', width: 16 },
      { header: 'Urutan Titik', key: 'sequence', width: 14 },
      { header: 'Waktu Patroli', key: 'startedAt', width: 22 },
      { header: 'Judul Temuan', key: 'title', width: 30 },
      { header: 'Deskripsi', key: 'description', width: 42 },
      { header: 'Severity', key: 'severity', width: 16 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Catatan Penyelesaian', key: 'resolutionNote', width: 38 },
      { header: 'Waktu Penyelesaian', key: 'resolvedAt', width: 22 },
      { header: 'Jumlah Foto', key: 'photoCount', width: 14 },
    ];

    for (let index = 1; index <= maxPhotos; index++) {
      columns.push({
        header: `Foto ${index}`,
        key: `photo${index}`,
        width: 20,
      });
    }

    worksheet.columns = columns;
    worksheet.addRow({});
    this.styleWorksheet(worksheet, 'LAPORAN TEMUAN PATROLI', subtitle);

    const tasks: PhotoTask[] = [];

    findings.forEach((finding, index) => {
      const row: Record<string, unknown> = {
        no: index + 1,
        reportNumber: finding.reportNumber,
        site: finding.site,
        employeeNumber: finding.employeeNumber,
        security: finding.security,
        point: finding.point,
        pointCode: finding.pointCode,
        sequence: finding.sequence,
        startedAt: finding.startedAt,
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        status: finding.status,
        resolutionNote: finding.resolutionNote,
        resolvedAt: finding.resolvedAt,
        photoCount: finding.photos.length,
      };

      for (let photoIndex = 0; photoIndex < maxPhotos; photoIndex++) {
        row[`photo${photoIndex + 1}`] = '';

        const photo = finding.photos[photoIndex];

        if (photo?.fileUrl) {
          tasks.push({
            rowIndex: index + 5,
            columnIndex: 16 + photoIndex,
            fileUrl: photo.fileUrl,
            worksheet,
          });
        }
      }

      worksheet.addRow(row);
    });

    this.styleDataRows(worksheet);

    for (let row = 5; row <= worksheet.rowCount; row++) {
      worksheet.getCell(row, 9).numFmt = 'dd mmm yyyy hh:mm';
      worksheet.getCell(row, 15).numFmt = 'dd mmm yyyy hh:mm';

      this.styleStatus(worksheet.getCell(row, 13), findings[row - 5].status);
    }

    return tasks;
  }

  private async embedPhotos(workbook: ExcelJS.Workbook, tasks: PhotoTask[]) {
    await this.mapWithConcurrency(tasks, 6, async (task) => {
      try {
        const photo = await this.readPhoto(task.fileUrl);

        if (!photo) return;

        const imageId = workbook.addImage({
          base64: `data:image/${photo.extension};base64,${photo.base64}`,
          extension: photo.extension,
        });

        task.worksheet.getRow(task.rowIndex).height = 75;

        task.worksheet.addImage(imageId, {
          tl: {
            col: task.columnIndex,
            row: task.rowIndex - 1,
          },
          ext: {
            width: 110,
            height: 65,
          },
          editAs: 'oneCell',
        });
      } catch (error) {
        this.logger.warn(
          `Gagal menyematkan foto ${task.fileUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
  }

  private async readPhoto(fileUrl: string): Promise<PhotoResult | null> {
    if (!fileUrl) return null;

    const cached = this.photoCache.get(fileUrl);

    if (cached) return cached;

    const promise = this.readPhotoFile(fileUrl);
    this.photoCache.set(fileUrl, promise);

    return promise;
  }

  private async readPhotoFile(fileUrl: string): Promise<PhotoResult | null> {
    let buffer: Buffer;

    if (/^https?:\/\//i.test(fileUrl)) {
      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      const pathname = fileUrl.split('?')[0];
      const relativePath = decodeURIComponent(pathname.replace(/^\/+/, ''));

      const uploadRoot = resolve(process.cwd(), 'uploads');
      const filePath = resolve(process.cwd(), relativePath);

      if (filePath !== uploadRoot && !filePath.startsWith(uploadRoot + sep)) {
        throw new Error('Path foto tidak valid');
      }

      buffer = await readFile(filePath);
    }

    const extension = extname(fileUrl.split('?')[0]).toLowerCase();

    if (extension === '.jpg' || extension === '.jpeg') {
      return {
        base64: buffer.toString('base64'),
        extension: 'jpeg',
      };
    }

    if (extension === '.png') {
      return {
        base64: buffer.toString('base64'),
        extension: 'png',
      };
    }

    const converted = await sharp(buffer).png().toBuffer();

    return {
      base64: converted.toString('base64'),
      extension: 'png',
    };
  }

  private async mapWithConcurrency<T>(
    items: T[],
    concurrency: number,
    callback: (item: T) => Promise<void>,
  ) {
    let currentIndex = 0;

    const workers = Array.from(
      {
        length: Math.min(concurrency, items.length),
      },
      async () => {
        while (true) {
          const index = currentIndex++;

          if (index >= items.length) return;

          await callback(items[index]);
        }
      },
    );

    await Promise.all(workers);
  }
}
