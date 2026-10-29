import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueryAuditLogDto } from './dto/query-audit-log.dto.js';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async createAudit(
    tx: Prisma.TransactionClient,
    data: {
      userId?: string;
      action: string;
      entityType: string;
      entityId?: string;
      oldData?: Prisma.InputJsonValue;
      newData?: Prisma.InputJsonValue;
    },
  ) {
    return tx.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldData: data.oldData,
        newData: data.newData,
      },
    });
  }

  async findAll(query: QueryAuditLogDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeNumber: true,
              role: {
                select: {
                  id: true,
                  name: true,
                },
              },
              devices: {
                select: {
                  id: true,
                  deviceIdentifier: true,
                  osVersion: true,
                  platform: true,
                },
              },

              sessions: {
                select: {
                  id: true,
                  revokedAt: true,
                  expiresAt: true,
                },
              },
            },
          },
        },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
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
    const auditLog = await this.prisma.auditLog.findUnique({
      where: { id },
    });

    if (!auditLog) {
      throw new NotFoundException({
        code: 'AUDIT_LOG_NOT_FOUND',
        message: 'Riwayat audit tidak ditemukan',
      });
    }

    return auditLog;
  }
}
