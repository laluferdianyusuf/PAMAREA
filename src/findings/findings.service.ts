import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import ExcelJS from 'exceljs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AuditLogService } from '../audit/audit.service.js';
import { UploadedFile } from '../common/types/uploaded-file.type.js';
import { Prisma } from '../generated/prisma/client.js';
import { FindingStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { AssignFindingDto } from './dto/assign-finding.dto.js';
import { CreateFindingDto } from './dto/create-finding.dto.js';
import { FindingQueryDto } from './dto/finding-query.dto.js';
import { ResolveFindingDto } from './dto/resolve-finding.dto.js';
import { UpdateFindingDto } from './dto/update-finding.dto.js';

@Injectable()
export class FindingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateFindingDto, userId: string) {
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: dto.patrolId,
      },
      select: {
        id: true,
        patrolPointId: true,
      },
    });

    if (!patrol) {
      throw new NotFoundException('Patrol tidak ditemukan');
    }

    if (patrol.patrolPointId !== dto.patrolPointId) {
      throw new BadRequestException('Patrol point tidak sesuai dengan patrol');
    }

    const point = await this.prisma.patrolPoint.findFirst({
      where: {
        id: dto.patrolPointId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!point) {
      throw new BadRequestException('Patrol point tidak aktif');
    }

    return this.prisma.$transaction(async (tx) => {
      const finding = await tx.finding.create({
        data: {
          patrolId: dto.patrolId,
          patrolPointId: dto.patrolPointId,
          reportedById: userId,
          title: dto.title.trim(),
          description: dto.description.trim(),
          severity: dto.severity,
          status: FindingStatus.OPEN,
        },
        include: this.detailInclude,
      });

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'CREATE_FINDING',
        entityType: 'Finding',
        entityId: finding.id,
        newData: {
          patrolId: finding.patrolId,
          patrolPointId: finding.patrolPointId,
          title: finding.title,
          severity: finding.severity,
          status: finding.status,
          reportedById: finding.reportedById,
        },
      });

      return finding;
    });
  }

  async exportFindings(params?: {
    status?: FindingStatus;
    severity?: FindingQueryDto['severity'];
    patrolId?: string;
    patrolPointId?: string;
    search?: string;
  }): Promise<Buffer> {
    const search = params?.search?.trim();

    const where: Prisma.FindingWhereInput = {
      ...(params?.status && { status: params.status }),
      ...(params?.severity && { severity: params.severity }),
      ...(params?.patrolId && { patrolId: params.patrolId }),
      ...(params?.patrolPointId && {
        patrolPointId: params.patrolPointId,
      }),
      ...(search && {
        OR: [
          {
            title: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            reportedBy: {
              fullName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
          {
            patrol: {
              reportNumber: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        ],
      }),
    };

    const findings = await this.prisma.finding.findMany({
      where,
      include: this.detailInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PAMAREA';
    workbook.created = new Date();

    const uploadDir = path.resolve(
      process.env.UPLOAD_DIR || path.join(process.cwd(), 'upload'),
    );

    let embeddedPhotos = 0;
    const missingPhotos: string[] = [];

    const sheet = workbook.addWorksheet('Data Temuan');

    sheet.columns = [
      { header: 'ID Temuan', key: 'id', width: 38 },
      { header: 'ID Patroli', key: 'patrolId', width: 38 },
      { header: 'Nomor Laporan', key: 'reportNumber', width: 25 },
      { header: 'Judul', key: 'title', width: 35 },
      { header: 'Deskripsi', key: 'description', width: 45 },
      { header: 'Tingkat Keparahan', key: 'severity', width: 22 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Kode Titik', key: 'pointCode', width: 18 },
      { header: 'Titik Patroli', key: 'pointName', width: 28 },
      { header: 'Lokasi/Site', key: 'siteName', width: 25 },
      { header: 'Pelapor', key: 'reportedBy', width: 30 },
      { header: 'Ditugaskan ke', key: 'assignedTo', width: 30 },
      { header: 'Diselesaikan oleh', key: 'resolvedBy', width: 30 },
      { header: 'Waktu Temuan', key: 'createdAt', width: 23 },
      { header: 'Waktu Selesai', key: 'resolvedAt', width: 23 },
      { header: 'Catatan Penyelesaian', key: 'resolutionNote', width: 38 },
      { header: 'ID Foto', key: 'photoId', width: 38 },
      { header: 'Nama File', key: 'fileName', width: 32 },
      { header: 'MIME Type', key: 'mimeType', width: 22 },
      { header: 'Ukuran File (byte)', key: 'fileSize', width: 20 },
      { header: 'Foto Bukti', key: 'photo', width: 22 },
    ];

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

    const personName = (
      person: {
        fullName: string;
        username: string;
      } | null,
    ) => {
      if (!person) return '-';
      return `${person.fullName} (${person.username})`;
    };

    for (const finding of findings) {
      // Satu baris per temuan jika tidak memiliki foto.
      // Jika memiliki beberapa foto, setiap foto mendapat satu baris.
      const photos = finding.photos.length ? finding.photos : [null];

      for (const photo of photos) {
        const row = sheet.addRow({
          id: finding.id,
          patrolId: finding.patrolId,
          reportNumber: finding.patrolId,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          status: finding.status,
          pointCode: finding.patrolPoint.code,
          pointName: finding.patrolPoint.name,
          siteName: finding.patrolPoint.site.name,
          reportedBy: personName(finding.reportedBy),
          assignedTo: personName(finding.assignedTo),
          resolvedBy: personName(finding.resolvedBy),
          createdAt: finding.createdAt,
          resolvedAt: finding.resolvedAt,
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

        row.getCell(14).numFmt = 'dd/mm/yyyy hh:mm';
        row.getCell(15).numFmt = 'dd/mm/yyyy hh:mm';

        if (!photo?.fileUrl) continue;

        const image = await readPhoto(photo.fileUrl);

        if (!image) {
          missingPhotos.push(photo.fileUrl);
          continue;
        }

        // Konversi ke ArrayBuffer agar kompatibel
        // dengan tipe ExcelJS pada konfigurasi TypeScript kamu.
        const imageBuffer = image.buffer;
        const arrayBuffer = imageBuffer.buffer.slice(
          imageBuffer.byteOffset,
          imageBuffer.byteOffset + imageBuffer.byteLength,
        ) as ArrayBuffer;

        const imageId = workbook.addImage({
          buffer: arrayBuffer,
          extension: image.extension,
        });

        sheet.addImage(imageId, {
          tl: {
            col: 20,
            row: row.number - 1,
          },
          ext: {
            width: 110,
            height: 75,
          },
          editAs: 'oneCell',
        });

        row.height = 82;
        embeddedPhotos++;
      }
    }

    if (sheet.rowCount > 0) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columnCount },
      };
    }

    console.log('[FINDING EXPORT]', {
      totalFindings: findings.length,
      embeddedPhotos,
      missingPhotos: missingPhotos.length,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async findAll(query: FindingQueryDto, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.FindingWhereInput = {
      ...(user.role.name !== 'ADMIN' && {
        reportedById: user.id,
      }),
      ...(query.status && { status: query.status }),
      ...(query.severity && { severity: query.severity }),
      ...(query.patrolId && { patrolId: query.patrolId }),
      ...(query.patrolPointId && {
        patrolPointId: query.patrolPointId,
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.finding.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.listInclude,
      }),
      this.prisma.finding.count({ where }),
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

  async findOne(id: string) {
    const finding = await this.prisma.finding.findUnique({
      where: { id },
      include: this.detailInclude,
    });

    if (!finding) {
      throw new NotFoundException('Finding tidak ditemukan');
    }

    return finding;
  }

  async update(id: string, dto: UpdateFindingDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const finding = await tx.finding.findUnique({
        where: { id },
      });

      if (!finding) {
        throw new NotFoundException('Finding tidak ditemukan');
      }

      if (finding.status === FindingStatus.RESOLVED) {
        throw new BadRequestException(
          'Finding yang sudah RESOLVED tidak dapat diubah',
        );
      }

      const updated = await tx.finding.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && {
            title: dto.title.trim(),
          }),
          ...(dto.description !== undefined && {
            description: dto.description.trim(),
          }),
          ...(dto.severity !== undefined && {
            severity: dto.severity,
          }),
        },
        include: this.detailInclude,
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'UPDATE_FINDING',
        entityType: 'Finding',
        entityId: id,
        oldData: {
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          status: finding.status,
        },
        newData: {
          title: updated.title,
          description: updated.description,
          severity: updated.severity,
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async start(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const finding = await tx.finding.findUnique({
        where: { id },
      });

      if (!finding) {
        throw new NotFoundException('Finding tidak ditemukan');
      }

      if (finding.status !== FindingStatus.OPEN) {
        throw new BadRequestException('Hanya finding OPEN yang dapat dimulai');
      }

      const updated = await tx.finding.update({
        where: { id },
        data: {
          status: FindingStatus.IN_PROGRESS,
        },
        include: this.detailInclude,
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'START_FINDING',
        entityType: 'Finding',
        entityId: id,
        oldData: {
          status: finding.status,
        },
        newData: {
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async assign(id: string, dto: AssignFindingDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const finding = await tx.finding.findUnique({
        where: { id },
      });

      if (!finding) {
        throw new NotFoundException('Finding tidak ditemukan');
      }

      if (finding.status === FindingStatus.RESOLVED) {
        throw new BadRequestException(
          'Finding yang sudah selesai tidak dapat ditugaskan',
        );
      }

      const user = await tx.user.findUnique({
        where: {
          id: dto.assignedTo,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!user) {
        throw new NotFoundException('User tidak ditemukan');
      }

      if (user.status !== 'ACTIVE') {
        throw new BadRequestException('User tidak aktif');
      }

      const updated = await tx.finding.update({
        where: { id },
        data: {
          assignedToId: dto.assignedTo,
          status:
            finding.status === FindingStatus.OPEN
              ? FindingStatus.IN_PROGRESS
              : finding.status,
        },
        include: this.detailInclude,
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'ASSIGN_FINDING',
        entityType: 'Finding',
        entityId: id,
        oldData: {
          assignedToId: finding.assignedToId,
          status: finding.status,
        },
        newData: {
          assignedToId: updated.assignedToId,
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async resolve(id: string, dto: ResolveFindingDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const finding = await tx.finding.findUnique({
        where: { id },
      });

      if (!finding) {
        throw new NotFoundException('Finding tidak ditemukan');
      }

      if (
        finding.status !== FindingStatus.OPEN &&
        finding.status !== FindingStatus.IN_PROGRESS
      ) {
        throw new BadRequestException(
          'Finding tidak dapat di-resolve pada status saat ini',
        );
      }

      const updated = await tx.finding.update({
        where: { id },
        data: {
          status: FindingStatus.RESOLVED,
          resolvedById: userId,
          resolvedAt: new Date(),
          resolutionNote: dto.resolutionNote.trim(),
        },
        include: this.detailInclude,
      });

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'RESOLVE_FINDING',
        entityType: 'Finding',
        entityId: id,
        oldData: {
          status: finding.status,
          resolvedById: finding.resolvedById,
          resolutionNote: finding.resolutionNote,
        },
        newData: {
          status: updated.status,
          resolvedById: updated.resolvedById,
          resolutionNote: updated.resolutionNote,
          resolvedAt: updated.resolvedAt?.toISOString() ?? null,
        },
      });

      return updated;
    });
  }

  async addPhoto(findingId: string, file: UploadedFile, actorId: string) {
    const finding = await this.prisma.finding.findUnique({
      where: {
        id: findingId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!finding) {
      throw new NotFoundException({
        code: 'FINDING_NOT_FOUND',
        message: 'Finding tidak ditemukan',
      });
    }

    if (finding.status === FindingStatus.RESOLVED) {
      throw new BadRequestException({
        code: 'FINDING_ALREADY_RESOLVED',
        message: 'Tidak dapat menambahkan foto ke finding yang sudah RESOLVED',
      });
    }

    if (!file) {
      throw new BadRequestException({
        code: 'PHOTO_REQUIRED',
        message: 'File foto wajib diupload',
      });
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'File yang diupload harus berupa gambar',
      });
    }

    const uploadedFile = await this.storageService.saveImage(file);

    return this.prisma.$transaction(async (tx) => {
      const currentFinding = await tx.finding.findUnique({
        where: {
          id: findingId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!currentFinding) {
        throw new NotFoundException({
          code: 'FINDING_NOT_FOUND',
          message: 'Finding tidak ditemukan',
        });
      }

      if (currentFinding.status === FindingStatus.RESOLVED) {
        throw new BadRequestException({
          code: 'FINDING_ALREADY_RESOLVED',
          message:
            'Tidak dapat menambahkan foto ke finding yang sudah RESOLVED',
        });
      }

      const photo = await tx.findingPhoto.create({
        data: {
          findingId,
          fileUrl: uploadedFile.url,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'ADD_FINDING_PHOTO',
        entityType: 'FindingPhoto',
        entityId: photo.id,
        newData: {
          findingId,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          fileSize: photo.fileSize,
        },
      });

      return photo;
    });
  }

  async removePhoto(findingId: string, photoId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const photo = await tx.findingPhoto.findFirst({
        where: {
          id: photoId,
          findingId,
        },
      });

      if (!photo) {
        throw new NotFoundException('Foto finding tidak ditemukan');
      }

      await tx.findingPhoto.delete({
        where: {
          id: photoId,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'REMOVE_FINDING_PHOTO',
        entityType: 'FindingPhoto',
        entityId: photoId,
        oldData: {
          findingId: photo.findingId,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          fileSize: photo.fileSize,
        },
      });

      return {
        message: 'Foto berhasil dihapus',
      };
    });
  }

  private readonly detailInclude = {
    reportedBy: {
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
    assignedTo: {
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
    resolvedBy: {
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
    patrolPoint: {
      select: {
        id: true,
        code: true,
        name: true,
        site: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
    photos: true,
  };

  private readonly listInclude = {
    reportedBy: {
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
    assignedTo: {
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
    patrolPoint: {
      select: {
        id: true,
        code: true,
        name: true,
        site: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
    photos: {
      select: {
        id: true,
        findingId: true,
        fileUrl: true,
      },
    },
  };
}
