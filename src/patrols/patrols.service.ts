import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AuditLogService } from '../audit/audit.service.js';
import { UploadedFile } from '../common/types/uploaded-file.type.js';
import { EmergencyService } from '../emergency/emergency.service.js';
import {
  GpsValidationStatus,
  NfcValidationStatus,
  PatrolCheckpointStatus,
  PatrolRoundStatus,
  PatrolStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { BypassNfcDto } from './dto/bypass-nfc.dto.js';
import { StartPatrolDto } from './dto/start-patrol.dto.js';
import { SubmitAnswersDto } from './dto/submit-answers.dto.js';
import { SubmitPhotoDto } from './dto/submit-photo.dto.js';
import { ValidateLocationDto } from './dto/validate-location.dto.js';
import { GpsValidationService } from './services/gps-validation.service.js';
import { NfcValidationService } from './services/nfc-validation.service.js';

@Injectable()
export class PatrolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gpsValidationService: GpsValidationService,
    private readonly nfcValidationService: NfcValidationService,
    private readonly storageService: StorageService,
    private readonly emergencyService: EmergencyService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getAllPatrolsGroupedByUser(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: PatrolStatus;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, Math.floor(params?.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(params?.limit ?? 20)));
    const skip = (page - 1) * limit;

    const search = params?.search?.trim();

    const where = {
      status: PatrolStatus.SUBMITTED,
      ...(params?.status && {
        status: params.status,
      }),
      ...(params?.startDate || params?.endDate
        ? {
            startedAt: {
              ...(params.startDate && {
                gte: new Date(params.startDate),
              }),
              ...(params.endDate && {
                lte: new Date(params.endDate),
              }),
            },
          }
        : {}),
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

    const [patrols, total] = await Promise.all([
      this.prisma.patrol.findMany({
        where,
        select: {
          id: true,
          reportNumber: true,
          startedAt: true,
          completedAt: true,
          status: true,

          latitude: true,
          longitude: true,
          gpsAccuracy: true,
          distanceFromPoint: true,
          gpsValidationStatus: true,

          nfcUidSnapshot: true,
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
              latitude: true,
              longitude: true,
            },
          },

          checkpoint: {
            select: {
              id: true,
              sequence: true,
              status: true,
              pointCodeSnapshot: true,
              pointNameSnapshot: true,
              visitedAt: true,
            },
          },

          answers: {
            select: {
              id: true,
              questionId: true,
              questionTextSnapshot: true,
              answerValue: true,
              answerLabelSnapshot: true,

              photos: {
                select: {
                  id: true,
                  fileUrl: true,
                  fileName: true,
                  mimeType: true,
                  fileSize: true,
                  latitude: true,
                  longitude: true,
                  capturedAt: true,
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },

          photos: {
            where: {
              answerId: null,
            },
            select: {
              id: true,
              fileUrl: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              latitude: true,
              longitude: true,
              capturedAt: true,
            },
          },

          findings: {
            select: {
              id: true,
              title: true,
              description: true,
              severity: true,
              status: true,
              resolvedAt: true,
              resolutionNote: true,
              createdAt: true,

              patrolPoint: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },

              reportedBy: {
                select: {
                  id: true,
                  fullName: true,
                  employeeNumber: true,
                },
              },

              assignedTo: {
                select: {
                  id: true,
                  fullName: true,
                  employeeNumber: true,
                },
              },

              resolvedBy: {
                select: {
                  id: true,
                  fullName: true,
                  employeeNumber: true,
                },
              },

              photos: {
                select: {
                  id: true,
                  fileUrl: true,
                  fileName: true,
                  mimeType: true,
                  fileSize: true,
                  createdAt: true,
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
        skip,
        take: limit,
      }),

      this.prisma.patrol.count({ where }),
    ]);

    type PatrolItem = (typeof patrols)[number];

    const grouped = new Map<
      string,
      {
        user: PatrolItem['user'];
        patrols: Omit<PatrolItem, 'user'>[];
      }
    >();

    for (const patrol of patrols) {
      const { user, ...patrolData } = patrol;

      if (!grouped.has(user.id)) {
        grouped.set(user.id, {
          user,
          patrols: [],
        });
      }

      grouped.get(user.id)!.patrols.push(patrolData);
    }

    return {
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      totalUsers: grouped.size,
      totalPatrols: patrols.length,
      data: Array.from(grouped.values()),
    };
  }

  async exportAllPatrolsGroupedByUser(params?: {
    search?: string;
    status?: PatrolStatus;
    startDate?: string;
    endDate?: string;
  }): Promise<Buffer> {
    const search = params?.search?.trim();

    const parseDate = (value?: string): Date | undefined => {
      if (!value) return undefined;

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException(`Format tanggal tidak valid: ${value}`);
      }

      return date;
    };

    const startDate = parseDate(params?.startDate);
    const endDate = parseDate(params?.endDate);

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'startDate tidak boleh lebih besar dari endDate',
      );
    }

    const where = {
      status: params?.status ?? PatrolStatus.SUBMITTED,

      ...(startDate || endDate
        ? {
            startedAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),

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

    // Menggunakan relasi dan field dari query Anda.
    // Tidak ada pagination: seluruh data sesuai filter diambil.
    const patrols = await this.prisma.patrol.findMany({
      where,
      select: {
        id: true,
        reportNumber: true,
        startedAt: true,
        completedAt: true,
        status: true,

        latitude: true,
        longitude: true,
        gpsAccuracy: true,
        distanceFromPoint: true,
        gpsValidationStatus: true,

        nfcUidSnapshot: true,
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
            latitude: true,
            longitude: true,
          },
        },

        checkpoint: {
          select: {
            id: true,
            sequence: true,
            status: true,
            pointCodeSnapshot: true,
            pointNameSnapshot: true,
            visitedAt: true,
          },
        },

        answers: {
          select: {
            id: true,
            questionId: true,
            questionTextSnapshot: true,
            answerValue: true,
            answerLabelSnapshot: true,
            photos: {
              select: {
                id: true,
                fileUrl: true,
                fileName: true,
                mimeType: true,
                fileSize: true,
                latitude: true,
                longitude: true,
                capturedAt: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },

        photos: {
          where: { answerId: null },
          select: {
            id: true,
            fileUrl: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            latitude: true,
            longitude: true,
            capturedAt: true,
          },
        },

        findings: {
          select: {
            id: true,
            title: true,
            description: true,
            severity: true,
            status: true,
            resolvedAt: true,
            resolutionNote: true,
            createdAt: true,

            patrolPoint: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },

            reportedBy: {
              select: {
                id: true,
                fullName: true,
                employeeNumber: true,
              },
            },

            assignedTo: {
              select: {
                id: true,
                fullName: true,
                employeeNumber: true,
              },
            },

            resolvedBy: {
              select: {
                id: true,
                fullName: true,
                employeeNumber: true,
              },
            },

            photos: {
              select: {
                id: true,
                fileUrl: true,
                fileName: true,
                mimeType: true,
                fileSize: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },

      orderBy: { startedAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'PAMAREA';
    workbook.created = new Date();

    const uploadDir = path.resolve(
      process.env.UPLOAD_DIR || path.join(process.cwd(), 'upload'),
    );

    const missingPhotos: string[] = [];
    let embeddedPhotos = 0;

    // Mengambil file lokal dengan validasi path.
    const readPhoto = async (
      fileUrl: string,
    ): Promise<{
      buffer: Buffer;
      extension: 'jpeg' | 'png';
    } | null> => {
      try {
        let relativePath = fileUrl;

        if (/^https?:\/\//i.test(fileUrl)) {
          relativePath = decodeURIComponent(new URL(fileUrl).pathname);
        }

        relativePath = relativePath.replace(/^\/+/, '');

        // Mendukung URL seperti /upload/foto.jpg
        // atau /uploads/foto.jpg.
        relativePath = relativePath.replace(
          /^(?:uploads?|public\/uploads?)\//i,
          '',
        );

        const fullPath = path.resolve(uploadDir, relativePath);
        const relative = path.relative(uploadDir, fullPath);

        if (
          !relative ||
          relative === '..' ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        ) {
          return null;
        }

        const buffer = await fs.readFile(fullPath);
        const extension = path.extname(fullPath).toLowerCase();

        if (extension === '.jpg' || extension === '.jpeg') {
          return { buffer, extension: 'jpeg' };
        }

        if (extension === '.png') {
          return { buffer, extension: 'png' };
        }

        return null;
      } catch {
        return null;
      }
    };

    // Membuat worksheet dan header.
    const makeSheet = (
      name: string,
      columns: { header: string; key: string; width: number }[],
    ) => {
      const sheet = workbook.addWorksheet(name);

      sheet.columns = columns;
      sheet.views = [{ state: 'frozen', ySplit: 1 }];

      const header = sheet.getRow(1);

      header.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };

      header.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };

      header.alignment = {
        vertical: 'middle',
        wrapText: true,
      };

      header.height = 28;

      return sheet;
    };

    const patrolSheet = makeSheet('Data Patroli', [
      { header: 'ID Patroli', key: 'id', width: 38 },
      { header: 'Nomor Laporan', key: 'reportNumber', width: 25 },
      { header: 'ID Petugas', key: 'userId', width: 38 },
      { header: 'NIK/No. Pegawai', key: 'employeeNumber', width: 22 },
      { header: 'Nama Petugas', key: 'fullName', width: 28 },
      { header: 'Username', key: 'username', width: 22 },
      { header: 'Lokasi/Site', key: 'site', width: 25 },
      { header: 'Titik Kode', key: 'pointCode', width: 18 },
      { header: 'Titik Patroli', key: 'pointName', width: 28 },
      { header: 'Checkpoint', key: 'checkpoint', width: 25 },
      { header: 'Urutan Checkpoint', key: 'sequence', width: 18 },
      { header: 'Status Checkpoint', key: 'checkpointStatus', width: 22 },
      { header: 'Waktu Kunjungan', key: 'visitedAt', width: 23 },
      { header: 'Mulai Patroli', key: 'startedAt', width: 23 },
      { header: 'Selesai Patroli', key: 'completedAt', width: 23 },
      { header: 'Status Patroli', key: 'status', width: 20 },
      { header: 'Latitude Aktual', key: 'latitude', width: 18 },
      { header: 'Longitude Aktual', key: 'longitude', width: 18 },
      { header: 'Akurasi GPS', key: 'gpsAccuracy', width: 16 },
      { header: 'Jarak dari Titik', key: 'distance', width: 18 },
      { header: 'Validasi GPS', key: 'gpsStatus', width: 20 },
      { header: 'UID NFC', key: 'nfcUid', width: 25 },
      { header: 'Validasi NFC', key: 'nfcStatus', width: 20 },
      { header: 'NFC Bypass', key: 'nfcBypass', width: 16 },
      { header: 'Alasan Bypass', key: 'bypassReason', width: 24 },
      { header: 'Catatan Bypass', key: 'bypassNote', width: 35 },
      { header: 'Jumlah Jawaban', key: 'answerCount', width: 17 },
      { header: 'Jumlah Foto Jawaban', key: 'answerPhotoCount', width: 21 },
      { header: 'Jumlah Foto Patroli', key: 'patrolPhotoCount', width: 21 },
      { header: 'Jumlah Temuan', key: 'findingCount', width: 17 },
    ]);

    const answerSheet = makeSheet('Jawaban & Foto', [
      { header: 'ID Patroli', key: 'patrolId', width: 38 },
      { header: 'Nomor Laporan', key: 'reportNumber', width: 25 },
      { header: 'Petugas', key: 'user', width: 28 },
      { header: 'Lokasi', key: 'site', width: 25 },
      { header: 'Titik Patroli', key: 'point', width: 28 },
      { header: 'ID Jawaban', key: 'answerId', width: 38 },
      { header: 'ID Pertanyaan', key: 'questionId', width: 38 },
      { header: 'Pertanyaan', key: 'question', width: 40 },
      { header: 'Nilai Jawaban', key: 'answerValue', width: 25 },
      { header: 'Label Jawaban', key: 'answerLabel', width: 28 },
      { header: 'ID Foto', key: 'photoId', width: 38 },
      { header: 'Nama File', key: 'fileName', width: 32 },
      { header: 'MIME Type', key: 'mimeType', width: 20 },
      { header: 'Ukuran File (byte)', key: 'fileSize', width: 20 },
      { header: 'Latitude Foto', key: 'latitude', width: 18 },
      { header: 'Longitude Foto', key: 'longitude', width: 18 },
      { header: 'Waktu Foto', key: 'capturedAt', width: 23 },
      { header: 'Foto Bukti', key: 'photo', width: 22 },
    ]);

    const patrolPhotoSheet = makeSheet('Foto Patroli', [
      { header: 'ID Patroli', key: 'patrolId', width: 38 },
      { header: 'Nomor Laporan', key: 'reportNumber', width: 25 },
      { header: 'Petugas', key: 'user', width: 28 },
      { header: 'Lokasi', key: 'site', width: 25 },
      { header: 'Titik Patroli', key: 'point', width: 28 },
      { header: 'ID Foto', key: 'photoId', width: 38 },
      { header: 'Nama File', key: 'fileName', width: 32 },
      { header: 'MIME Type', key: 'mimeType', width: 20 },
      { header: 'Ukuran File (byte)', key: 'fileSize', width: 20 },
      { header: 'Latitude Foto', key: 'latitude', width: 18 },
      { header: 'Longitude Foto', key: 'longitude', width: 18 },
      { header: 'Waktu Foto', key: 'capturedAt', width: 23 },
      { header: 'Foto Bukti', key: 'photo', width: 22 },
    ]);

    const findingSheet = makeSheet('Temuan & Foto', [
      { header: 'ID Patroli', key: 'patrolId', width: 38 },
      { header: 'Nomor Laporan', key: 'reportNumber', width: 25 },
      { header: 'Petugas Patroli', key: 'user', width: 28 },
      { header: 'ID Temuan', key: 'findingId', width: 38 },
      { header: 'Judul Temuan', key: 'title', width: 35 },
      { header: 'Deskripsi', key: 'description', width: 45 },
      { header: 'Tingkat Keparahan', key: 'severity', width: 22 },
      { header: 'Status Temuan', key: 'status', width: 20 },
      { header: 'Titik Temuan', key: 'point', width: 28 },
      { header: 'Pelapor', key: 'reportedBy', width: 28 },
      { header: 'Ditugaskan ke', key: 'assignedTo', width: 28 },
      { header: 'Diselesaikan oleh', key: 'resolvedBy', width: 28 },
      { header: 'Waktu Temuan', key: 'createdAt', width: 23 },
      { header: 'Waktu Selesai', key: 'resolvedAt', width: 23 },
      { header: 'Catatan Penyelesaian', key: 'resolutionNote', width: 38 },
      { header: 'ID Foto', key: 'photoId', width: 38 },
      { header: 'Nama File', key: 'fileName', width: 32 },
      { header: 'MIME Type', key: 'mimeType', width: 20 },
      { header: 'Ukuran File (byte)', key: 'fileSize', width: 20 },
      { header: 'Foto Temuan', key: 'photo', width: 22 },
    ]);

    const dateValue = (value: Date | null | undefined) => value ?? null;

    const personName = (
      person: { fullName: string; employeeNumber: string | null } | null,
    ) => {
      if (!person) return '-';

      return [person.fullName, person.employeeNumber]
        .filter(Boolean)
        .join(' - ');
    };

    const addPhotoToRow = async (
      sheet: ExcelJS.Worksheet,
      rowNumber: number,
      photoColumn: number,
      fileUrl: string | null,
    ) => {
      if (!fileUrl) return;

      const photo = await readPhoto(fileUrl);

      if (!photo) {
        missingPhotos.push(fileUrl);
        return;
      }

      // Konversi Buffer menjadi ArrayBuffer agar cocok
      // dengan tipe yang diminta ExcelJS.
      const imageBuffer = photo.buffer;

      const arrayBuffer = imageBuffer.buffer.slice(
        imageBuffer.byteOffset,
        imageBuffer.byteOffset + imageBuffer.byteLength,
      ) as ArrayBuffer;

      const imageId = workbook.addImage({
        buffer: arrayBuffer,
        extension: photo.extension,
      });

      sheet.addImage(imageId, {
        tl: {
          col: photoColumn - 1,
          row: rowNumber - 1,
        },
        ext: {
          width: 110,
          height: 75,
        },
        editAs: 'oneCell',
      });

      sheet.getRow(rowNumber).height = 82;
      embeddedPhotos++;
    };

    for (const patrol of patrols) {
      const patrolRow = patrolSheet.addRow({
        id: patrol.id,
        reportNumber: patrol.reportNumber,
        userId: patrol.user.id,
        employeeNumber: patrol.user.employeeNumber,
        fullName: patrol.user.fullName,
        username: patrol.user.username,
        site: patrol.site.name,
        pointCode: patrol.patrolPoint.code,
        pointName: patrol.patrolPoint.name,
        checkpoint:
          patrol.checkpoint?.pointNameSnapshot ?? patrol.patrolPoint.name,
        sequence: patrol.checkpoint?.sequence ?? null,
        checkpointStatus: patrol.checkpoint?.status ?? null,
        visitedAt: dateValue(patrol.checkpoint?.visitedAt),
        startedAt: dateValue(patrol.startedAt),
        completedAt: dateValue(patrol.completedAt),
        status: patrol.status,
        latitude: patrol.latitude,
        longitude: patrol.longitude,
        gpsAccuracy: patrol.gpsAccuracy,
        distance: patrol.distanceFromPoint,
        gpsStatus: patrol.gpsValidationStatus,
        nfcUid: patrol.nfcUidSnapshot,
        nfcStatus: patrol.nfcValidationStatus,
        nfcBypass: patrol.nfcBypass,
        bypassReason: patrol.nfcBypassReason,
        bypassNote: patrol.nfcBypassNote,
        answerCount: patrol.answers.length,
        answerPhotoCount: patrol.answers.reduce(
          (sum, answer) => sum + answer.photos.length,
          0,
        ),
        patrolPhotoCount: patrol.photos.length,
        findingCount: patrol.findings.length,
      });

      patrolRow.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', wrapText: true };
      });

      // Set format tanggal.
      for (const column of [13, 14, 15]) {
        patrolRow.getCell(column).numFmt = 'dd/mm/yyyy hh:mm';
      }

      for (const answer of patrol.answers) {
        const photos = answer.photos.length ? answer.photos : [null];

        for (const photo of photos) {
          const row = answerSheet.addRow({
            patrolId: patrol.id,
            reportNumber: patrol.reportNumber,
            user: patrol.user.fullName,
            site: patrol.site.name,
            point: patrol.patrolPoint.name,
            answerId: answer.id,
            questionId: answer.questionId,
            question: answer.questionTextSnapshot,
            answerValue: answer.answerValue,
            answerLabel: answer.answerLabelSnapshot,
            photoId: photo?.id ?? null,
            fileName: photo?.fileName ?? null,
            mimeType: photo?.mimeType ?? null,
            fileSize: photo?.fileSize ?? null,
            latitude: photo?.latitude ?? null,
            longitude: photo?.longitude ?? null,
            capturedAt: dateValue(photo?.capturedAt),
          });

          row.eachCell((cell) => {
            cell.alignment = {
              vertical: 'middle',
              wrapText: true,
            };
          });

          row.getCell(17).numFmt = 'dd/mm/yyyy hh:mm';

          if (photo) {
            await addPhotoToRow(answerSheet, row.number, 18, photo.fileUrl);
          }
        }
      }

      for (const photo of patrol.photos) {
        const row = patrolPhotoSheet.addRow({
          patrolId: patrol.id,
          reportNumber: patrol.reportNumber,
          user: patrol.user.fullName,
          site: patrol.site.name,
          point: patrol.patrolPoint.name,
          photoId: photo.id,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          fileSize: photo.fileSize,
          latitude: photo.latitude,
          longitude: photo.longitude,
          capturedAt: dateValue(photo.capturedAt),
        });

        row.eachCell((cell) => {
          cell.alignment = {
            vertical: 'middle',
            wrapText: true,
          };
        });

        row.getCell(12).numFmt = 'dd/mm/yyyy hh:mm';

        await addPhotoToRow(patrolPhotoSheet, row.number, 13, photo.fileUrl);
      }

      for (const finding of patrol.findings) {
        const photos = finding.photos.length ? finding.photos : [null];

        for (const photo of photos) {
          const row = findingSheet.addRow({
            patrolId: patrol.id,
            reportNumber: patrol.reportNumber,
            user: patrol.user.fullName,
            findingId: finding.id,
            title: finding.title,
            description: finding.description,
            severity: finding.severity,
            status: finding.status,
            point: finding.patrolPoint.name,
            reportedBy: personName(finding.reportedBy),
            assignedTo: personName(finding.assignedTo),
            resolvedBy: personName(finding.resolvedBy),
            createdAt: dateValue(finding.createdAt),
            resolvedAt: dateValue(finding.resolvedAt),
            resolutionNote: finding.resolutionNote,
            photoId: photo?.id ?? null,
            fileName: photo?.fileName ?? null,
            mimeType: photo?.mimeType ?? null,
            fileSize: photo?.fileSize ?? null,
          });

          row.eachCell((cell) => {
            cell.alignment = {
              vertical: 'middle',
              wrapText: true,
            };
          });

          row.getCell(13).numFmt = 'dd/mm/yyyy hh:mm';
          row.getCell(14).numFmt = 'dd/mm/yyyy hh:mm';

          if (photo) {
            await addPhotoToRow(findingSheet, row.number, 20, photo.fileUrl);
          }
        }
      }
    }

    // Filter header di setiap sheet.
    for (const sheet of workbook.worksheets) {
      sheet.autoFilter = {
        from: {
          row: 1,
          column: 1,
        },
        to: {
          row: 1,
          column: sheet.columnCount,
        },
      };
    }

    console.log('[PATROL EXPORT]', {
      totalPatrols: patrols.length,
      embeddedPhotos,
      missingPhotos: missingPhotos.length,
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return Buffer.from(buffer);
  }

  async getToday(userId: string) {
    const today = this.startOfToday();

    const assignments = await this.prisma.patrolScheduleAssignment.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        startDate: {
          lte: today,
        },
        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: today,
            },
          },
        ],
      },
      include: {
        schedule: {
          include: {
            site: true,
          },
        },
        rounds: {
          where: {
            scheduleDate: {
              date: today,
            },
          },
          orderBy: {
            roundNumber: 'asc',
          },
          include: {
            checkpoints: {
              orderBy: {
                sequence: 'asc',
              },
            },
          },
        },
      },
    });

    return assignments.map((assignment) => ({
      assignmentId: assignment.id,
      schedule: {
        id: assignment.schedule.id,
        name: assignment.schedule.name,
        startTime: assignment.schedule.startTime,
        endTime: assignment.schedule.endTime,
        intervalMinutes: assignment.schedule.intervalMinutes,
        gracePeriodMinutes: assignment.schedule.gracePeriodMinutes,
        enforceSequence: assignment.schedule.enforceSequence,
      },
      site: {
        id: assignment.schedule.site.id,
        code: assignment.schedule.site.code,
        name: assignment.schedule.site.name,
        address: assignment.schedule.site.address,
      },
      rounds: assignment.rounds,
    }));
  }

  async startPatrol(checkpointId: string, userId: string, dto: StartPatrolDto) {
    const checkpoint = await this.prisma.patrolCheckpoint.findUnique({
      where: { id: checkpointId },
      include: {
        round: {
          include: {
            scheduleDate: {
              include: { schedule: true },
            },
            assignment: true,
          },
        },
        patrolPoint: true,
      },
    });

    if (!checkpoint) {
      throw new NotFoundException({
        code: 'CHECKPOINT_NOT_FOUND',
        message: 'Checkpoint tidak ditemukan',
      });
    }

    const round = checkpoint.round;
    const schedule = round.scheduleDate.schedule;
    const assignment = round.assignment;

    if (assignment.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'CHECKPOINT_ACCESS_DENIED',
        message: 'Checkpoint ini bukan milik Anda',
      });
    }

    const today = this.startOfToday();

    if (new Date(round.scheduleDate.date).getTime() !== today.getTime()) {
      throw new UnprocessableEntityException({
        code: 'CHECKPOINT_NOT_TODAY',
        message: 'Checkpoint ini bukan untuk hari ini',
      });
    }

    if (
      checkpoint.status === PatrolCheckpointStatus.COMPLETED ||
      checkpoint.status === PatrolCheckpointStatus.CANCELLED
    ) {
      throw new UnprocessableEntityException({
        code: 'CHECKPOINT_NOT_AVAILABLE',
        message: 'Checkpoint sudah tidak dapat diproses',
      });
    }

    if (schedule.enforceSequence) {
      const previousCheckpoint = await this.prisma.patrolCheckpoint.findFirst({
        where: {
          roundId: round.id,
          sequence: { lt: checkpoint.sequence },
          required: true,
          status: { not: PatrolCheckpointStatus.COMPLETED },
        },
        orderBy: { sequence: 'asc' },
      });

      if (previousCheckpoint) {
        throw new UnprocessableEntityException({
          code: 'CHECKPOINT_SEQUENCE_REQUIRED',
          message: 'Checkpoint sebelumnya belum selesai',
          details: {
            previousCheckpointId: previousCheckpoint.id,
          },
        });
      }
    }

    const existingPatrol = await this.prisma.patrol.findFirst({
      where: {
        checkpointId: checkpoint.id,
        userId,
        status: {
          in: [
            PatrolStatus.STARTED,
            PatrolStatus.VALIDATED,
            PatrolStatus.IN_PROGRESS,
          ],
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (existingPatrol) {
      return this.getPatrol(existingPatrol.id, userId);
    }

    const reportNumber = await this.generateReportNumber();
    const startedAt = new Date();

    const patrol = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patrol.create({
        data: {
          reportNumber,
          userId,
          siteId: schedule.siteId,
          patrolPointId: checkpoint.patrolPointId,
          scheduleAssignmentId: assignment.id,
          checkpointId: checkpoint.id,
          deviceId: dto.deviceId ?? null,
          status: PatrolStatus.STARTED,
          startedAt,
        },
      });

      await tx.patrolCheckpoint.update({
        where: { id: checkpoint.id },
        data: {
          status: PatrolCheckpointStatus.IN_PROGRESS,
        },
      });

      if (round.status === PatrolRoundStatus.PENDING) {
        await tx.patrolRound.update({
          where: { id: round.id },
          data: {
            status: PatrolRoundStatus.IN_PROGRESS,
            startedAt,
          },
        });
      }

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'START_PATROL',
        entityType: 'Patrol',
        entityId: created.id,
        oldData: {
          patrolStatus: null,
          checkpointStatus: checkpoint.status,
          roundStatus: round.status,
        },
        newData: {
          reportNumber: created.reportNumber,
          patrolStatus: created.status,
          checkpointId: checkpoint.id,
          checkpointStatus: PatrolCheckpointStatus.IN_PROGRESS,
          roundId: round.id,
          roundStatus:
            round.status === PatrolRoundStatus.PENDING
              ? PatrolRoundStatus.IN_PROGRESS
              : round.status,
          scheduleAssignmentId: assignment.id,
          patrolPointId: checkpoint.patrolPointId,
          siteId: schedule.siteId,
          startedAt: startedAt.toISOString(),
        },
      });

      return created;
    });

    return this.getPatrol(patrol.id, userId);
  }

  async startNextPatrol(userId: string) {
    const today = this.startOfToday();
    const now = new Date();

    const assignments = await this.prisma.patrolScheduleAssignment.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      include: {
        schedule: true,
        rounds: {
          where: {
            scheduleDate: {
              date: today,
            },
            status: {
              in: ['PENDING', 'IN_PROGRESS'],
            },
            scheduledStartAt: { lte: now },
          },
          orderBy: {
            scheduledStartAt: 'asc',
          },
          include: {
            scheduleDate: true,
            checkpoints: {
              orderBy: {
                sequence: 'asc',
              },
            },
          },
        },
      },
    });

    const rounds = assignments
      .flatMap((assignment) =>
        assignment.rounds.map((round) => ({
          assignment,
          round,
        })),
      )
      .sort((a, b) => {
        const aActive = a.round.status === 'IN_PROGRESS' ? 0 : 1;
        const bActive = b.round.status === 'IN_PROGRESS' ? 0 : 1;

        return (
          aActive - bActive ||
          a.round.scheduledStartAt.getTime() -
            b.round.scheduledStartAt.getTime()
        );
      });

    const device = await this.prisma.userDevice.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
    });

    if (!device) {
      throw new NotFoundException('Perangkat belum terdaftar untuk akun ini');
    }

    const deviceId = device.id;

    for (const { assignment, round } of rounds) {
      let checkpoint;

      if (assignment.schedule.enforceSequence) {
        const previous = await this.prisma.patrolCheckpoint.findFirst({
          where: {
            roundId: round.id,
            required: true,
            status: {
              not: 'COMPLETED',
            },
          },
          orderBy: {
            sequence: 'asc',
          },
        });

        if (!previous) {
          continue;
        }

        if (
          previous.status !== 'PENDING' &&
          previous.status !== 'IN_PROGRESS'
        ) {
          continue;
        }

        checkpoint = previous;
      } else {
        checkpoint = round.checkpoints.find(
          (item) => item.status === 'PENDING' || item.status === 'IN_PROGRESS',
        );
      }

      if (!checkpoint) continue;

      const existingPatrol = await this.prisma.patrol.findFirst({
        where: {
          checkpointId: checkpoint.id,
          userId,
          status: {
            in: [
              PatrolStatus.STARTED,
              PatrolStatus.VALIDATED,
              PatrolStatus.IN_PROGRESS,
            ],
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
      });

      if (existingPatrol) {
        return this.getPatrol(existingPatrol.id, userId);
      }

      return this.startPatrol(checkpoint.id, userId, {
        deviceId: deviceId ?? '',
      });
    }

    throw new UnprocessableEntityException({
      code: 'NO_AVAILABLE_CHECKPOINT',
      message:
        'Tidak ada checkpoint yang dapat dimulai saat ini. Periksa jadwal, ronde, dan penugasan Anda.',
    });
  }

  async getPatrol(patrolId: string, userId: string) {
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: patrolId,
      },
      include: {
        site: true,
        patrolPoint: true,
        checkpoint: {
          include: {
            patrolPoint: {
              include: {
                site: true,
              },
            },
            round: {
              include: {
                scheduleDate: {
                  include: {
                    schedule: true,
                  },
                },
              },
            },
          },
        },
        answers: {
          include: {
            question: {
              include: {
                options: {
                  orderBy: {
                    sortOrder: 'asc',
                  },
                },
              },
            },
            photos: true,
          },
        },
        photos: true,
        findings: {
          include: {
            photos: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke patrol ini',
      });
    }

    return {
      ...patrol,
      siteName: patrol.site.name,
    };
  }

  async bypassNfc(patrolId: string, userId: string, dto: BypassNfcDto) {
    const patrol = await this.prisma.patrol.findUnique({
      where: { id: patrolId },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke patrol ini',
      });
    }

    if (patrol.status === PatrolStatus.SUBMITTED) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ALREADY_SUBMITTED',
        message: 'Patrol sudah disubmit',
      });
    }

    if (patrol.gpsValidationStatus !== GpsValidationStatus.VALID) {
      throw new UnprocessableEntityException({
        code: 'GPS_REQUIRED',
        message: 'GPS harus valid sebelum NFC dapat dibypass',
      });
    }

    if (patrol.nfcValidationStatus === NfcValidationStatus.VALID) {
      throw new UnprocessableEntityException({
        code: 'NFC_ALREADY_VALID',
        message: 'NFC patrol ini sudah valid',
      });
    }

    if (dto.reason === 'OTHER' && !dto.note?.trim()) {
      throw new UnprocessableEntityException({
        code: 'NFC_BYPASS_NOTE_REQUIRED',
        message: 'Catatan wajib diisi untuk alasan OTHER',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.patrol.update({
        where: { id: patrolId },
        data: {
          nfcValidationStatus: NfcValidationStatus.BYPASSED,
          nfcBypass: true,
          nfcBypassReason: dto.reason,
          nfcBypassNote: dto.note?.trim() || null,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'BYPASS_PATROL_NFC',
        entityType: 'Patrol',
        entityId: patrolId,
        oldData: {
          nfcValidationStatus: patrol.nfcValidationStatus,
          nfcBypass: patrol.nfcBypass,
          nfcBypassReason: patrol.nfcBypassReason,
          nfcBypassNote: patrol.nfcBypassNote,
        },
        newData: {
          nfcValidationStatus: result.nfcValidationStatus,
          nfcBypass: result.nfcBypass,
          nfcBypassReason: result.nfcBypassReason,
          nfcBypassNote: result.nfcBypassNote,
          gpsValidationStatus: result.gpsValidationStatus,
        },
      });

      return result;
    });

    return {
      patrolId: updated.id,
      nfcBypass: updated.nfcBypass,
      nfcValidationStatus: updated.nfcValidationStatus,
      bypassReason: updated.nfcBypassReason,
      bypassNote: updated.nfcBypassNote,
      gpsValidationStatus: updated.gpsValidationStatus,
    };
  }

  async validateLocation(
    patrolId: string,
    userId: string,
    dto: ValidateLocationDto,
  ) {
    const patrol = await this.prisma.patrol.findUnique({
      where: { id: patrolId },
      include: { patrolPoint: true },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke patrol ini',
      });
    }

    if (patrol.status === PatrolStatus.SUBMITTED) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ALREADY_SUBMITTED',
        message: 'Patrol sudah disubmit',
      });
    }

    const point = patrol.patrolPoint;

    const result = this.gpsValidationService.validate(
      dto.latitude,
      dto.longitude,
      Number(point.latitude),
      Number(point.longitude),
      point.radiusMeters,
      dto.accuracy,
    );

    const validationStatus = result.valid
      ? GpsValidationStatus.VALID
      : GpsValidationStatus.INVALID;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.patrol.update({
        where: { id: patrolId },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          gpsAccuracy: dto.accuracy ?? null,
          distanceFromPoint: result.distanceMeters,
          gpsValidationStatus: validationStatus,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'VALIDATE_PATROL_GPS',
        entityType: 'Patrol',
        entityId: patrolId,
        oldData: {
          gpsValidationStatus: patrol.gpsValidationStatus,
          latitude: patrol.latitude,
          longitude: patrol.longitude,
          gpsAccuracy: patrol.gpsAccuracy,
          distanceFromPoint: patrol.distanceFromPoint,
        },
        newData: {
          gpsValidationStatus: updated.gpsValidationStatus,
          latitude: updated.latitude,
          longitude: updated.longitude,
          gpsAccuracy: updated.gpsAccuracy,
          distanceFromPoint: result.distanceMeters,
          radiusMeters: result.radiusMeters,
          accuracyMeters: result.accuracyMeters,
        },
      });
    });

    if (!result.valid) {
      throw new UnprocessableEntityException({
        code: 'GPS_OUTSIDE_RADIUS',
        message: 'Posisi Anda berada di luar radius patrol point',
        details: {
          distanceMeters: result.distanceMeters,
          radiusMeters: result.radiusMeters,
          accuracyMeters: result.accuracyMeters,
        },
      });
    }

    return {
      valid: true,
      distanceMeters: result.distanceMeters,
      radiusMeters: result.radiusMeters,
      accuracyMeters: result.accuracyMeters,
    };
  }

  async validateNfc(patrolId: string, userId: string, uid: string) {
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: patrolId,
      },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.gpsValidationStatus !== 'VALID') {
      throw new UnprocessableEntityException({
        code: 'GPS_REQUIRED',
        message: 'Validasi GPS harus berhasil sebelum scan NFC',
      });
    }

    return this.nfcValidationService.validate(patrolId, userId, uid);
  }

  async submitAnswers(patrolId: string, userId: string, dto: SubmitAnswersDto) {
    const patrol = await this.getPatrolForMutation(patrolId, userId);

    // this.ensureValidationComplete(patrol);

    const pointQuestions = await this.prisma.pointQuestion.findMany({
      where: {
        patrolPointId: patrol.patrolPointId,
      },
      include: {
        question: {
          include: { options: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const questionMap = new Map(
      pointQuestions.map((item) => [item.questionId, item]),
    );

    for (const answer of dto.answers) {
      const pointQuestion = questionMap.get(answer.questionId);

      if (!pointQuestion) {
        throw new BadRequestException({
          code: 'QUESTION_NOT_ALLOWED',
          message: 'Pertanyaan tidak berlaku untuk patrol point ini',
          questionId: answer.questionId,
        });
      }

      if (pointQuestion.question.questionType === 'SINGLE_CHOICE') {
        const option = pointQuestion.question.options.find(
          (item) => item.value === answer.answerValue,
        );

        if (!option) {
          throw new BadRequestException({
            code: 'INVALID_OPTION',
            message: 'Pilihan jawaban tidak valid',
            questionId: answer.questionId,
          });
        }
      }

      if (pointQuestion.question.questionType === 'YES_NO') {
        if (!['YES', 'NO'].includes(answer.answerValue ?? '')) {
          throw new BadRequestException({
            code: 'INVALID_YES_NO',
            message: 'Jawaban YES_NO harus YES atau NO',
            questionId: answer.questionId,
          });
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const changes: {
        questionId: string;
        oldValue: string | null;
        newValue: string | null;
      }[] = [];

      for (const answer of dto.answers) {
        const pointQuestion = questionMap.get(answer.questionId)!;

        const existing = await tx.patrolAnswer.findUnique({
          where: {
            patrolId_questionId: {
              patrolId,
              questionId: answer.questionId,
            },
          },
        });

        await tx.patrolAnswer.upsert({
          where: {
            patrolId_questionId: {
              patrolId,
              questionId: answer.questionId,
            },
          },
          create: {
            patrolId,
            questionId: answer.questionId,
            questionTextSnapshot: pointQuestion.question.questionText,
            answerValue: answer.answerValue ?? null,
            answerLabelSnapshot: answer.answerLabel ?? null,
          },
          update: {
            answerValue: answer.answerValue ?? null,
            answerLabelSnapshot: answer.answerLabel ?? null,
          },
        });

        changes.push({
          questionId: answer.questionId,
          oldValue: existing?.answerValue ?? null,
          newValue: answer.answerValue ?? null,
        });
      }

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'SUBMIT_PATROL_ANSWERS',
        entityType: 'Patrol',
        entityId: patrolId,
        oldData: {
          answerCount: changes.length,
          answers: changes.map((item) => ({
            questionId: item.questionId,
            answerValue: item.oldValue,
          })),
        },
        newData: {
          answerCount: changes.length,
          answers: changes.map((item) => ({
            questionId: item.questionId,
            answerValue: item.newValue,
          })),
        },
      });
    });

    return this.getPatrol(patrolId, userId);
  }

  async addPhoto(
    patrolId: string,
    userId: string,
    dto: SubmitPhotoDto,
    file: UploadedFile,
  ) {
    const patrol = await this.getPatrolForMutation(patrolId, userId);

    // this.ensureValidationComplete(patrol);

    if (!file) {
      throw new BadRequestException({
        code: 'PHOTO_REQUIRED',
        message: 'File foto wajib diupload.',
      });
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'File yang diupload harus berupa gambar.',
      });
    }

    if (!dto.answerId) {
      throw new BadRequestException({
        code: 'ANSWER_ID_REQUIRED',
        message: 'Foto wajib dikaitkan dengan jawaban pertanyaan.',
      });
    }

    const answer = await this.prisma.patrolAnswer.findFirst({
      where: {
        id: dto.answerId,
        patrolId,
      },
    });

    if (!answer) {
      throw new BadRequestException({
        code: 'ANSWER_NOT_FOUND',
        message: 'Jawaban tidak ditemukan pada patroli ini.',
      });
    }

    const uploadedFile = await this.storageService.saveImage(file);

    return this.prisma.$transaction(async (tx) => {
      const photo = await tx.patrolPhoto.create({
        data: {
          patrolId,
          answerId: answer.id,
          fileUrl: uploadedFile.url,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'UPLOAD_PATROL_PHOTO',
        entityType: 'PatrolPhoto',
        entityId: photo.id,
        newData: {
          patrolId,
          answerId: answer.id,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          fileSize: photo.fileSize,
          capturedAt: photo.capturedAt
            ? new Date(photo.capturedAt.toISOString())
            : new Date(),
        },
      });

      return photo;
    });
  }

  async submitPatrol(patrolId: string, userId: string) {
    const patrol = await this.getPatrolForMutation(patrolId, userId);

    // this.ensureValidationComplete(patrol);

    await this.validateRequiredAnswers(patrolId, patrol.patrolPointId);
    await this.validateRequiredPhotos(patrolId, patrol.patrolPointId);

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedPatrol = await tx.patrol.update({
        where: { id: patrolId },
        data: {
          status: PatrolStatus.SUBMITTED,
          completedAt: new Date(),
        },
      });

      let oldCheckpointStatus: PatrolCheckpointStatus | null = null;

      if (patrol.checkpointId) {
        const checkpoint = await tx.patrolCheckpoint.findUnique({
          where: { id: patrol.checkpointId },
          select: { status: true },
        });

        oldCheckpointStatus = checkpoint?.status ?? null;

        await tx.patrolCheckpoint.update({
          where: { id: patrol.checkpointId },
          data: {
            status: PatrolCheckpointStatus.COMPLETED,
            visitedAt: new Date(),
          },
        });
      }

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'SUBMIT_PATROL',
        entityType: 'Patrol',
        entityId: patrolId,
        oldData: {
          status: patrol.status,
          completedAt: patrol.completedAt?.toISOString() ?? null,
          checkpointId: patrol.checkpointId,
          checkpointStatus: oldCheckpointStatus,
        },
        newData: {
          status: updatedPatrol.status,
          completedAt: updatedPatrol.completedAt?.toISOString() ?? null,
          checkpointId: patrol.checkpointId,
          checkpointStatus: patrol.checkpointId
            ? PatrolCheckpointStatus.COMPLETED
            : null,
        },
      });

      return updatedPatrol;
    });

    if (patrol.checkpointId) {
      await this.updateRoundStatus(patrol.checkpoint!.round.id);
    }

    const unsafeAnswers = await this.findUnsafeAnswers(patrolId);

    if (unsafeAnswers.length > 0) {
      try {
        await this.emergencyService.broadcastPatrolWarning(userId, {
          siteId: patrol.siteId,
          reportNumber: result.reportNumber,
          patrolPointName: patrol.patrolPoint.name,
          unsafeAnswers,
        });
      } catch (error) {
        console.error('[PATROL WARNING] Gagal mengirim notifikasi FCM:', error);
      }
    }

    return this.getPatrol(result.id, userId);
  }

  private async validateRequiredAnswers(
    patrolId: string,
    patrolPointId: string,
  ) {
    const questions = await this.prisma.pointQuestion.findMany({
      where: {
        patrolPointId,
        isRequired: true,
      },
      include: {
        question: true,
      },
    });

    if (questions.length === 0) {
      return;
    }

    const answers = await this.prisma.patrolAnswer.findMany({
      where: {
        patrolId,
        questionId: {
          in: questions.map((item) => item.questionId),
        },
      },
    });

    const answerMap = new Map(
      answers.map((answer) => [answer.questionId, answer]),
    );

    const missing = questions.filter((item) => {
      const answer = answerMap.get(item.questionId);

      return !answer || !answer.answerValue?.trim();
    });

    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: 'REQUIRED_ANSWERS_MISSING',
        message: 'Masih ada pertanyaan wajib yang belum dijawab',
        questionIds: missing.map((item) => item.questionId),
      });
    }
  }

  private async validateRequiredPhotos(
    patrolId: string,
    patrolPointId: string,
  ) {
    const pointQuestions = await this.prisma.pointQuestion.findMany({
      where: { patrolPointId },
      include: {
        question: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    const answers = await this.prisma.patrolAnswer.findMany({
      where: { patrolId },
      include: {
        photos: {
          select: { id: true },
        },
      },
    });

    const answerMap = new Map(
      answers.map((answer) => [answer.questionId, answer]),
    );

    const missingAnswers: {
      questionId: string;
      question: string;
    }[] = [];

    const missingPhotos: {
      questionId: string;
      question: string;
      answerId: string | null;
    }[] = [];

    for (const pointQuestion of pointQuestions) {
      const answer = answerMap.get(pointQuestion.questionId);

      if (!answer || !answer.answerValue?.trim()) {
        missingAnswers.push({
          questionId: pointQuestion.questionId,
          question: pointQuestion.question.questionText,
        });

        continue;
      }

      if (answer.photos.length === 0) {
        missingPhotos.push({
          questionId: pointQuestion.questionId,
          question: answer.questionTextSnapshot,
          answerId: answer.id,
        });
      }
    }

    if (missingAnswers.length > 0 || missingPhotos.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PATROL_CHECKLIST_INCOMPLETE',
        message:
          'Setiap pertanyaan wajib dijawab dan disertai minimal satu foto.',
        missingAnswers,
        missingPhotos,
      });
    }
  }

  private async updateRoundStatus(roundId: string): Promise<void> {
    const round = await this.prisma.patrolRound.findUnique({
      where: { id: roundId },
      include: {
        checkpoints: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!round) {
      return;
    }

    const requiredCheckpoints = round.checkpoints.filter(
      (checkpoint) => checkpoint.required,
    );

    const completedCount = requiredCheckpoints.filter(
      (checkpoint) => checkpoint.status === 'COMPLETED',
    ).length;

    const allRequiredCompleted =
      requiredCheckpoints.length > 0 &&
      completedCount === requiredCheckpoints.length;

    let status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

    if (allRequiredCompleted) {
      status = 'COMPLETED';
    } else if (completedCount > 0) {
      status = 'IN_PROGRESS';
    } else {
      status = round.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'PENDING';
    }

    await this.prisma.patrolRound.update({
      where: { id: roundId },
      data: {
        status,
        ...(allRequiredCompleted ? { completedAt: new Date() } : {}),
      },
    });
  }

  private async getPatrolForMutation(patrolId: string, userId: string) {
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: patrolId,
      },
      include: {
        patrolPoint: true,
        checkpoint: {
          include: {
            round: {
              include: {
                scheduleDate: {
                  include: {
                    schedule: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke patrol ini',
      });
    }

    if (
      patrol.status === PatrolStatus.SUBMITTED ||
      patrol.status === PatrolStatus.CANCELLED
    ) {
      throw new UnprocessableEntityException({
        code: 'PATROL_NOT_EDITABLE',
        message: 'Patrol sudah tidak dapat diubah',
      });
    }

    return patrol;
  }

  private ensureValidationComplete(patrol: {
    gpsValidationStatus: GpsValidationStatus;
    nfcValidationStatus: NfcValidationStatus;
  }) {
    if (patrol.gpsValidationStatus !== GpsValidationStatus.VALID) {
      throw new UnprocessableEntityException({
        code: 'GPS_REQUIRED',
        message: 'Validasi GPS belum berhasil',
      });
    }

    const nfcValid = patrol.nfcValidationStatus === NfcValidationStatus.VALID;

    const nfcBypassed =
      patrol.nfcValidationStatus === NfcValidationStatus.BYPASSED;

    if (!nfcValid && !nfcBypassed) {
      throw new UnprocessableEntityException({
        code: 'NFC_REQUIRED',
        message: 'NFC harus divalidasi atau dibypass terlebih dahulu',
      });
    }
  }

  private async generateReportNumber() {
    const now = new Date();

    const date = now.toISOString().slice(0, 10).replace(/-/g, '');

    const random = Math.random().toString(36).substring(2, 8).toUpperCase();

    return `PAT-${date}-${random}`;
  }

  private startOfToday(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    // Representasi tanggal kalender WIB pada tengah malam UTC.
    return new Date(
      `${values.year}-${values.month}-${values.day}T00:00:00.000Z`,
    );
  }

  private async findUnsafeAnswers(patrolId: string) {
    const answers = await this.prisma.patrolAnswer.findMany({
      where: { patrolId },
      include: {
        question: {
          include: { options: true },
        },
      },
    });

    return answers.flatMap((answer) => {
      const value = answer.answerValue?.trim();

      if (answer.question.questionType === 'YES_NO' && value === 'NO') {
        return [
          {
            question: answer.questionTextSnapshot,
            answer: answer.answerLabelSnapshot ?? value,
          },
        ];
      }

      if (answer.question.questionType === 'SINGLE_CHOICE') {
        const option = answer.question.options.find(
          (item) => item.value === value,
        );

        if (option && !option.isSafe) {
          return [
            {
              question: answer.questionTextSnapshot,
              answer: answer.answerLabelSnapshot ?? option.label,
            },
          ];
        }
      }

      return [];
    });
  }
}
