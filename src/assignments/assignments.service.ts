import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  PatrolPointStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePatrolAssignmentDto } from './dto/create-assignments.dto.js';
import { UpdatePatrolAssignmentDto } from './dto/update-assignments.dto.js';

@Injectable()
export class PatrolAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  private assignmentInclude() {
    return {
      user: {
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },

      patrolPoint: {
        select: {
          id: true,
          siteId: true,
          code: true,
          name: true,
          latitude: true,
          longitude: true,
          radiusMeters: true,
          status: true,
        },
      },

      createdBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
    } satisfies Prisma.PatrolAssignmentInclude;
  }

  async create(dto: CreatePatrolAssignmentDto, createdById: string) {
    const startDate = this.parseDate(dto.startDate);
    const endDate = dto.endDate ? this.parseDate(dto.endDate) : null;

    this.validateDateRange(startDate, endDate);

    return this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findFirst({
          where: {
            id: dto.userId,
            deletedAt: null,
          },
          include: {
            role: true,
          },
        });

        if (!user) {
          throw new NotFoundException('Security/user tidak ditemukan');
        }

        if (user.status !== 'ACTIVE') {
          throw new BadRequestException('Security/user tidak aktif');
        }

        if (user.role.name !== 'SECURITY') {
          throw new BadRequestException(
            'User yang ditugaskan harus memiliki role SECURITY',
          );
        }

        const patrolPoint = await tx.patrolPoint.findFirst({
          where: {
            id: dto.patrolPointId,
            deletedAt: null,
          },
        });

        if (!patrolPoint) {
          throw new NotFoundException('Patrol point tidak ditemukan');
        }

        if (patrolPoint.status !== 'ACTIVE') {
          throw new BadRequestException('Patrol point tidak aktif');
        }

        const creator = await tx.user.findFirst({
          where: {
            id: createdById,
            deletedAt: null,
            status: 'ACTIVE',
          },
        });

        if (!creator) {
          throw new NotFoundException(
            'User pembuat assignment tidak ditemukan',
          );
        }

        const overlapping = await tx.patrolAssignment.findFirst({
          where: {
            userId: dto.userId,
            patrolPointId: dto.patrolPointId,
            status: AssignmentStatus.ACTIVE,

            startDate: {
              lte: endDate ?? new Date('9999-12-31'),
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
            'Security sudah memiliki assignment yang waktunya overlap pada patrol point ini',
          );
        }

        return tx.patrolAssignment.create({
          data: {
            userId: dto.userId,
            patrolPointId: dto.patrolPointId,
            startDate,
            endDate,
            status: AssignmentStatus.ACTIVE,
            createdById: createdById,
          },

          include: this.assignmentInclude(),
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async findAll(params?: {
    userId?: string;
    patrolPointId?: string;
    status?: AssignmentStatus;
  }) {
    return this.prisma.patrolAssignment.findMany({
      where: {
        ...(params?.userId
          ? {
              userId: params.userId,
            }
          : {}),

        ...(params?.patrolPointId
          ? {
              patrolPointId: params.patrolPointId,
            }
          : {}),

        ...(params?.status
          ? {
              status: params.status,
            }
          : {}),
      },

      include: this.assignmentInclude(),

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

  async findActive() {
    const today = this.startOfToday();

    return this.prisma.patrolAssignment.findMany({
      where: {
        status: AssignmentStatus.ACTIVE,

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

        user: {
          status: 'ACTIVE',
          deletedAt: null,
        },

        patrolPoint: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },

      include: this.assignmentInclude(),

      orderBy: {
        startDate: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const assignment = await this.prisma.patrolAssignment.findUnique({
      where: {
        id,
      },

      include: this.assignmentInclude(),
    });

    if (!assignment) {
      throw new NotFoundException('Patrol assignment tidak ditemukan');
    }

    return assignment;
  }

  async update(id: string, dto: UpdatePatrolAssignmentDto) {
    const existing = await this.prisma.patrolAssignment.findUnique({
      where: {
        id,
      },
    });

    if (!existing) {
      throw new NotFoundException('Patrol assignment tidak ditemukan');
    }

    if (existing.status !== AssignmentStatus.ACTIVE) {
      throw new BadRequestException(
        'Assignment yang tidak aktif tidak dapat diubah',
      );
    }

    const startDate = dto.startDate
      ? this.parseDate(dto.startDate)
      : existing.startDate;

    const endDate =
      dto.endDate === undefined
        ? existing.endDate
        : dto.endDate === null
          ? null
          : this.parseDate(dto.endDate);

    this.validateDateRange(startDate, endDate);

    const overlapping = await this.prisma.patrolAssignment.findFirst({
      where: {
        id: {
          not: id,
        },

        userId: existing.userId,
        patrolPointId: existing.patrolPointId,
        status: AssignmentStatus.ACTIVE,

        startDate: {
          lte: endDate ?? new Date('9999-12-31'),
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
        'Tanggal assignment overlap dengan assignment lain',
      );
    }

    return this.prisma.patrolAssignment.update({
      where: {
        id,
      },

      data: {
        startDate,
        endDate,
      },

      include: this.assignmentInclude(),
    });
  }

  async deactivate(id: string) {
    const assignment = await this.prisma.patrolAssignment.findUnique({
      where: {
        id,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Patrol assignment tidak ditemukan');
    }

    if (assignment.status === AssignmentStatus.INACTIVE) {
      return assignment;
    }

    return this.prisma.patrolAssignment.update({
      where: {
        id,
      },

      data: {
        status: AssignmentStatus.INACTIVE,

        endDate: assignment.endDate ?? this.startOfToday(),
      },

      include: this.assignmentInclude(),
    });
  }

  async findActiveByUser(userId: string) {
    const today = this.startOfToday();

    return this.prisma.patrolAssignment.findMany({
      where: {
        userId,

        status: AssignmentStatus.ACTIVE,

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

        patrolPoint: {
          status: PatrolPointStatus.ACTIVE as never,
        },
      },

      include: this.assignmentInclude(),

      orderBy: {
        startDate: 'asc',
      },
    });
  }

  async findActiveByPatrolPoint(patrolPointId: string) {
    const today = this.startOfToday();

    return this.prisma.patrolAssignment.findMany({
      where: {
        patrolPointId,

        status: AssignmentStatus.ACTIVE,

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

        user: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },

      include: this.assignmentInclude(),

      orderBy: {
        startDate: 'asc',
      },
    });
  }

  async validateAssignment(
    userId: string,
    patrolPointId: string,
    date = new Date(),
  ) {
    const targetDate = this.startOfDay(date);

    const assignment = await this.prisma.patrolAssignment.findFirst({
      where: {
        userId,
        patrolPointId,

        status: AssignmentStatus.ACTIVE,

        startDate: {
          lte: targetDate,
        },

        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: targetDate,
            },
          },
        ],

        user: {
          status: 'ACTIVE',
          deletedAt: null,
        },

        patrolPoint: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },

      include: this.assignmentInclude(),
    });

    if (!assignment) {
      return {
        valid: false,
        assignment: null,
      };
    }

    return {
      valid: true,
      assignment,
    };
  }

  private parseDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Tanggal tidak valid: ${value}`);
    }

    return date;
  }

  private validateDateRange(startDate: Date, endDate: Date | null) {
    if (endDate && endDate < startDate) {
      throw new BadRequestException(
        'endDate tidak boleh lebih kecil dari startDate',
      );
    }
  }

  private startOfDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private startOfToday(): Date {
    return this.startOfDay(new Date());
  }
}
