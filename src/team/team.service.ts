import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../audit/audit.service.js';
import { Prisma, TeamStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { QueryTeamDto } from './dto/query-team.dto.js';
import { UpdateTeamDto } from './dto/update-team.dto.js';

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private readonly teamSelect = {
    id: true,
    siteId: true,
    name: true,
    code: true,
    description: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    site: {
      select: {
        id: true,
        code: true,
        name: true,
      },
    },
    _count: {
      select: {
        users: true,
      },
    },
  } satisfies Prisma.TeamSelect;

  private async ensureSiteExists(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true },
    });

    if (!site) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: 'Site tidak ditemukan',
      });
    }
  }

  private async ensureUnique(
    siteId: string,
    name: string,
    code: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.team.findFirst({
      where: {
        siteId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ name }, { code }],
      },
      select: {
        id: true,
        name: true,
        code: true,
      },
    });

    if (existing?.name === name) {
      throw new ConflictException({
        code: 'TEAM_NAME_EXISTS',
        message: 'Nama regu sudah digunakan pada site ini',
      });
    }

    if (existing?.code === code) {
      throw new ConflictException({
        code: 'TEAM_CODE_EXISTS',
        message: 'Kode regu sudah digunakan pada site ini',
      });
    }
  }

  private async ensureTeamExists(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      select: this.teamSelect,
    });

    if (!team) {
      throw new NotFoundException({
        code: 'TEAM_NOT_FOUND',
        message: 'Regu tidak ditemukan',
      });
    }

    return team;
  }

  private handlePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException({
        code: 'TEAM_ALREADY_EXISTS',
        message: 'Nama atau kode regu sudah digunakan pada site ini',
      });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      throw new ConflictException({
        code: 'TEAM_HAS_RELATIONS',
        message: 'Regu tidak dapat dihapus karena masih memiliki relasi data',
      });
    }

    throw error;
  }

  async findAll(query: QueryTeamDto) {
    return this.prisma.team.findMany({
      where: {
        ...(query.siteId ? { siteId: query.siteId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      select: this.teamSelect,
      orderBy: [{ site: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async findActive(siteId?: string) {
    return this.prisma.team.findMany({
      where: {
        status: TeamStatus.ACTIVE,
        ...(siteId ? { siteId } : {}),
      },
      select: this.teamSelect,
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    return this.ensureTeamExists(id);
  }

  async create(
    dto: CreateTeamDto,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.ensureSiteExists(dto.siteId);

    await this.ensureUnique(dto.siteId, dto.name.trim(), dto.code.trim());

    try {
      return await this.prisma.$transaction(async (tx) => {
        const team = await tx.team.create({
          data: {
            siteId: dto.siteId,
            name: dto.name.trim(),
            code: dto.code.trim(),
            description: dto.description?.trim() || null,
          },
          select: this.teamSelect,
        });

        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'CREATE_TEAM',
          entityType: 'Team',
          entityId: team.id,
          newData: {
            siteId: team.siteId,
            name: team.name,
            code: team.code,
            description: team.description,
            status: team.status,
          } as Prisma.InputJsonValue,
        });

        return team;
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(
    id: string,
    dto: UpdateTeamDto,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const current = await this.ensureTeamExists(id);
    const siteId = dto.siteId ?? current.siteId;
    const name = dto.name?.trim() ?? current.name;
    const code = dto.code?.trim() ?? current.code;

    if (dto.name !== undefined && !name) {
      throw new BadRequestException({
        code: 'INVALID_TEAM_NAME',
        message: 'Nama regu tidak boleh kosong',
      });
    }

    if (dto.code !== undefined && !code) {
      throw new BadRequestException({
        code: 'INVALID_TEAM_CODE',
        message: 'Kode regu tidak boleh kosong',
      });
    }

    if (siteId !== current.siteId) {
      await this.ensureSiteExists(siteId);
    }

    await this.ensureUnique(siteId, name, code, id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const team = await tx.team.update({
          where: { id },
          data: {
            siteId,
            name,
            code,
            ...(dto.description !== undefined
              ? { description: dto.description?.trim() || null }
              : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
          },
          select: this.teamSelect,
        });

        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'UPDATE_TEAM',
          entityType: 'Team',
          entityId: team.id,
          oldData: {
            siteId: current.siteId,
            name: current.name,
            code: current.code,
            description: current.description,
            status: current.status,
          } as Prisma.InputJsonValue,
          newData: {
            siteId: team.siteId,
            name: team.name,
            code: team.code,
            description: team.description,
            status: team.status,
          } as Prisma.InputJsonValue,
        });

        return team;
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(
    id: string,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const current = await this.ensureTeamExists(id);

    if (current._count.users > 0) {
      throw new ConflictException({
        code: 'TEAM_HAS_USERS',
        message: 'Regu tidak dapat dihapus karena masih memiliki anggota',
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'DELETE_TEAM',
          entityType: 'Team',
          entityId: current.id,
          oldData: {
            siteId: current.siteId,
            name: current.name,
            code: current.code,
            description: current.description,
            status: current.status,
          } as Prisma.InputJsonValue,
        });

        await tx.team.delete({
          where: { id },
        });

        return {
          message: 'Regu berhasil dihapus',
          data: { id },
        };
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }
}
