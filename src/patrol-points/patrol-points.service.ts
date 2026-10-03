import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePatrolPointDto } from './dto/create-patrol-points.dto.js';
import { UpdatePatrolPointDto } from './dto/update-patrol-points.dto.js';

@Injectable()
export class PatrolPointsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePatrolPointDto, createdById?: string) {
    const site = await this.prisma.site.findFirst({
      where: {
        id: dto.siteId,
      },
    });

    if (!site) {
      throw new NotFoundException('Site tidak ditemukan');
    }

    if (site.status !== 'ACTIVE') {
      throw new ConflictException('Site sedang tidak aktif');
    }

    const existing = await this.prisma.patrolPoint.findFirst({
      where: {
        siteId: dto.siteId,
        code: dto.code,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Kode patrol point "${dto.code}" sudah digunakan di site ini`,
      );
    }

    return this.prisma.patrolPoint.create({
      data: {
        siteId: dto.siteId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radiusMeters ?? 30,
        createdById: createdById ?? '',
      },

      include: {
        site: true,
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
    });
  }

  async findAll(siteId?: string) {
    return this.prisma.patrolPoint.findMany({
      where: {
        deletedAt: null,
        ...(siteId ? { siteId } : {}),
      },

      orderBy: [
        { siteId: 'asc' },
        {
          code: 'asc',
        },
      ],

      include: {
        site: {
          select: { id: true, code: true, name: true, status: true },
        },

        nfcAssignments: true,

        _count: {
          select: {
            assignments: true,
            patrols: true,
            findings: true,
          },
        },
      },
    });
  }

  async findActive(siteId?: string) {
    return this.prisma.patrolPoint.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,

        ...(siteId
          ? {
              siteId,
            }
          : {}),
      },

      orderBy: {
        code: 'asc',
      },

      select: {
        id: true,
        siteId: true,
        code: true,
        name: true,
        description: true,
        latitude: true,
        longitude: true,
        radiusMeters: true,
        status: true,
      },
    });
  }

  async findOne(id: string) {
    const patrolPoint = await this.prisma.patrolPoint.findFirst({
      where: {
        id,
        deletedAt: null,
      },

      include: {
        site: true,

        creator: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },

        nfcAssignments: {
          include: {
            nfcTag: true,
          },
        },

        pointQuestions: {
          include: {
            question: true,
          },
        },

        _count: {
          select: {
            assignments: true,
            patrols: true,
            findings: true,
          },
        },
      },
    });

    if (!patrolPoint) {
      throw new NotFoundException('Patrol point tidak ditemukan');
    }

    return patrolPoint;
  }

  async update(id: string, dto: UpdatePatrolPointDto) {
    const existing = await this.prisma.patrolPoint.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Patrol point tidak ditemukan');
    }

    if (dto.code && dto.code !== existing.code) {
      const duplicate = await this.prisma.patrolPoint.findFirst({
        where: {
          siteId: existing.siteId,
          code: dto.code,
          deletedAt: null,
          NOT: {
            id,
          },
        },
      });

      if (duplicate) {
        throw new ConflictException(
          `Kode patrol point "${dto.code}" sudah digunakan`,
        );
      }
    }

    return this.prisma.patrolPoint.update({
      where: {
        id,
      },

      data: {
        ...(dto.code !== undefined && {
          code: dto.code,
        }),

        ...(dto.name !== undefined && {
          name: dto.name,
        }),

        ...(dto.description !== undefined && {
          description: dto.description,
        }),

        ...(dto.latitude !== undefined && {
          latitude: dto.latitude,
        }),

        ...(dto.longitude !== undefined && {
          longitude: dto.longitude,
        }),

        ...(dto.radiusMeters !== undefined && {
          radiusMeters: dto.radiusMeters,
        }),

        ...(dto.status !== undefined && {
          status: dto.status,
        }),
      },

      include: {
        site: true,
      },
    });
  }

  async deactivate(id: string) {
    const existing = await this.prisma.patrolPoint.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Patrol point tidak ditemukan');
    }

    return this.prisma.patrolPoint.update({
      where: {
        id,
      },

      data: {
        status: 'INACTIVE',
      },
    });
  }

  async activate(id: string) {
    const existing = await this.prisma.patrolPoint.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Patrol point tidak ditemukan');
    }

    return this.prisma.patrolPoint.update({
      where: {
        id,
      },

      data: {
        status: 'ACTIVE',
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.patrolPoint.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Patrol point tidak ditemukan');
    }

    return this.prisma.patrolPoint.update({
      where: {
        id,
      },

      data: {
        deletedAt: new Date(),
        status: 'INACTIVE',
      },
    });
  }
}
