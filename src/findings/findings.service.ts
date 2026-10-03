import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { FindingStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddFindingPhotoDto } from './dto/add-finding-photo.dto.js';
import { AssignFindingDto } from './dto/assign-finding.dto.js';
import { CreateFindingDto } from './dto/create-finding.dto.js';
import { FindingQueryDto } from './dto/finding-query.dto.js';
import { ResolveFindingDto } from './dto/resolve-finding.dto.js';
import { UpdateFindingDto } from './dto/update-finding.dto.js';

@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.finding.create({
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
  }

  async findAll(query: FindingQueryDto) {
    const {
      page = 1,
      limit = 20,
      status,
      severity,
      patrolId,
      patrolPointId,
      reportedBy,
      assignedTo,
    } = query;

    const where: Prisma.FindingWhereInput = {
      ...(status && { status }),
      ...(severity && { severity }),
      ...(patrolId && { patrolId }),
      ...(patrolPointId && { patrolPointId }),

      ...(reportedBy && {
        reportedBy: {
          id: reportedBy,
        },
      }),

      ...(assignedTo && {
        assignedTo: {
          id: assignedTo,
        },
      }),
    };

    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.finding.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: this.listInclude,
      }),

      this.prisma.finding.count({
        where,
      }),
    ]);

    return {
      data: items,
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

  async update(id: string, dto: UpdateFindingDto) {
    const finding = await this.prisma.finding.findUnique({
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

    return this.prisma.finding.update({
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
  }

  async start(id: string) {
    const finding = await this.prisma.finding.findUnique({
      where: { id },
    });

    if (!finding) {
      throw new NotFoundException('Finding tidak ditemukan');
    }

    if (finding.status !== FindingStatus.OPEN) {
      throw new BadRequestException('Hanya finding OPEN yang dapat dimulai');
    }

    return this.prisma.finding.update({
      where: { id },
      data: {
        status: FindingStatus.IN_PROGRESS,
      },
      include: this.detailInclude,
    });
  }

  async assign(id: string, dto: AssignFindingDto) {
    const finding = await this.prisma.finding.findUnique({
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

    const user = await this.prisma.user.findUnique({
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

    return this.prisma.finding.update({
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
  }

  async resolve(id: string, dto: ResolveFindingDto, userId: string) {
    const finding = await this.prisma.finding.findUnique({
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

    return this.prisma.finding.update({
      where: { id },
      data: {
        status: FindingStatus.RESOLVED,
        resolvedById: userId,
        resolvedAt: new Date(),
        resolutionNote: dto.resolutionNote.trim(),
      },
      include: this.detailInclude,
    });
  }

  async addPhoto(findingId: string, dto: AddFindingPhotoDto) {
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
      throw new NotFoundException('Finding tidak ditemukan');
    }

    if (finding.status === FindingStatus.RESOLVED) {
      throw new BadRequestException(
        'Tidak dapat menambahkan foto ke finding yang sudah RESOLVED',
      );
    }

    return this.prisma.findingPhoto.create({
      data: {
        findingId,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName ?? '',
        mimeType: dto.mimeType ?? '',
        fileSize: dto.fileSize ?? 0,
      },
    });
  }

  async removePhoto(findingId: string, photoId: string) {
    const photo = await this.prisma.findingPhoto.findFirst({
      where: {
        id: photoId,
        findingId,
      },
    });

    if (!photo) {
      throw new NotFoundException('Foto finding tidak ditemukan');
    }

    await this.prisma.findingPhoto.delete({
      where: {
        id: photoId,
      },
    });

    return {
      message: 'Foto berhasil dihapus',
    };
  }

  private readonly detailInclude = {
    reporter: {
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
    assignee: {
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
    resolver: {
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
    closer: {
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
      },
    },
    photos: true,
  };

  private readonly listInclude = {
    reporter: {
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
    assignee: {
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
      },
    },
  };
}
