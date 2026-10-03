import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { Prisma } from '../generated/prisma/client.js';
import { NfcAssignmentStatus, NfcStatus } from '../generated/prisma/enums.js';
import { AssignNfcDto } from './dto/assign-nfc.dto.js';
import { RemoveNfcAssignmentDto } from './dto/remove-nfc-assignment.dto.js';
import { ReplaceNfcAssignmentDto } from './dto/replace-nfc-assignment.dto.js';

@Injectable()
export class PatrolPointNfcService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(dto: AssignNfcDto, createdById: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const patrolPoint = await tx.patrolPoint.findUnique({
          where: {
            id: dto.patrolPointId,
          },
        });

        if (!patrolPoint) {
          throw new NotFoundException('Patrol point tidak ditemukan');
        }

        if (patrolPoint.status !== 'ACTIVE') {
          throw new ConflictException('Patrol point sedang tidak aktif');
        }

        if (patrolPoint.deletedAt) {
          throw new ConflictException('Patrol point sudah dihapus');
        }

        const nfcTag = await tx.nfcTag.findUnique({
          where: {
            id: dto.nfcTagId,
          },
        });

        if (!nfcTag) {
          throw new NotFoundException('NFC Tag tidak ditemukan');
        }

        if (nfcTag.status !== NfcStatus.UNASSIGNED) {
          throw new ConflictException(
            `NFC tidak dapat di-assign karena statusnya ${nfcTag.status}`,
          );
        }

        const pointAssignment = await tx.patrolPointNfc.findFirst({
          where: {
            patrolPointId: dto.patrolPointId,

            status: NfcAssignmentStatus.ACTIVE,
          },
        });

        if (pointAssignment) {
          throw new ConflictException('Patrol point sudah memiliki NFC aktif');
        }

        const nfcAssignment = await tx.patrolPointNfc.findFirst({
          where: {
            nfcTagId: dto.nfcTagId,

            status: NfcAssignmentStatus.ACTIVE,
          },
        });

        if (nfcAssignment) {
          throw new ConflictException(
            'NFC Tag sudah digunakan pada patrol point lain',
          );
        }

        const assignment = await tx.patrolPointNfc.create({
          data: {
            patrolPointId: dto.patrolPointId,

            nfcTagId: dto.nfcTagId,

            status: NfcAssignmentStatus.ACTIVE,

            assignedAt: new Date(),

            createdById: createdById,
          },

          include: this.assignmentInclude(),
        });

        await tx.nfcTag.update({
          where: {
            id: dto.nfcTagId,
          },

          data: {
            status: NfcStatus.ACTIVE,
          },
        });

        return assignment;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async findAll(patrolPointId?: string, nfcTagId?: string) {
    return this.prisma.patrolPointNfc.findMany({
      where: {
        ...(patrolPointId ? { patrolPointId } : {}),

        ...(nfcTagId ? { nfcTagId } : {}),

        status: NfcAssignmentStatus.ACTIVE,
      },

      orderBy: {
        assignedAt: 'desc',
      },

      include: this.assignmentInclude(),
    });
  }

  async findHistory(patrolPointId?: string, nfcTagId?: string) {
    return this.prisma.patrolPointNfc.findMany({
      where: {
        ...(patrolPointId ? { patrolPointId } : {}),

        ...(nfcTagId ? { nfcTagId } : {}),
      },

      orderBy: {
        assignedAt: 'desc',
      },

      include: this.assignmentInclude(),
    });
  }

  async findOne(id: string) {
    const assignment = await this.prisma.patrolPointNfc.findUnique({
      where: {
        id,
      },

      include: this.assignmentInclude(),
    });

    if (!assignment) {
      throw new NotFoundException('NFC assignment tidak ditemukan');
    }

    return assignment;
  }

  async findActiveByPatrolPoint(patrolPointId: string) {
    return this.prisma.patrolPointNfc.findFirst({
      where: {
        patrolPointId,

        status: NfcAssignmentStatus.ACTIVE,
      },

      include: {
        nfcTag: {
          select: {
            id: true,
            uid: true,
            label: true,
            status: true,
          },
        },

        patrolPoint: {
          select: {
            id: true,
            code: true,
            name: true,
            latitude: true,
            longitude: true,
            radiusMeters: true,
            status: true,
          },
        },
      },
    });
  }

  async findActiveByNfc(nfcTagId: string) {
    return this.prisma.patrolPointNfc.findFirst({
      where: {
        nfcTagId,

        status: NfcAssignmentStatus.ACTIVE,
      },

      include: {
        nfcTag: {
          select: {
            id: true,
            uid: true,
            label: true,
            status: true,
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
      },
    });
  }

  async remove(id: string, dto: RemoveNfcAssignmentDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const assignment = await tx.patrolPointNfc.findUnique({
          where: {
            id,
          },
        });

        if (!assignment) {
          throw new NotFoundException('NFC assignment tidak ditemukan');
        }

        if (assignment.status !== NfcAssignmentStatus.ACTIVE) {
          throw new ConflictException('Assignment sudah tidak aktif');
        }

        const updated = await tx.patrolPointNfc.update({
          where: {
            id,
          },

          data: {
            status: NfcAssignmentStatus.REMOVED,

            unassignedAt: new Date(),

            reason: dto.reason?.trim() || 'Assignment removed',
          },

          include: this.assignmentInclude(),
        });

        await tx.nfcTag.update({
          where: {
            id: assignment.nfcTagId,
          },

          data: {
            status: NfcStatus.UNASSIGNED,
          },
        });

        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async replace(assignmentId: string, dto: ReplaceNfcAssignmentDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const oldAssignment = await tx.patrolPointNfc.findUnique({
          where: {
            id: assignmentId,
          },
        });

        if (!oldAssignment) {
          throw new NotFoundException('NFC assignment tidak ditemukan');
        }

        if (oldAssignment.status !== NfcAssignmentStatus.ACTIVE) {
          throw new ConflictException('Assignment tersebut sudah tidak aktif');
        }

        if (oldAssignment.nfcTagId === dto.newNfcTagId) {
          throw new ConflictException(
            'NFC baru tidak boleh sama dengan NFC lama',
          );
        }

        const newNfc = await tx.nfcTag.findUnique({
          where: {
            id: dto.newNfcTagId,
          },
        });

        if (!newNfc) {
          throw new NotFoundException('NFC baru tidak ditemukan');
        }

        if (newNfc.status !== NfcStatus.UNASSIGNED) {
          throw new ConflictException(
            `NFC baru harus UNASSIGNED, status saat ini ${newNfc.status}`,
          );
        }

        const patrolPoint = await tx.patrolPoint.findUnique({
          where: {
            id: oldAssignment.patrolPointId,
          },
        });

        if (!patrolPoint) {
          throw new NotFoundException('Patrol point tidak ditemukan');
        }

        if (patrolPoint.status !== 'ACTIVE') {
          throw new ConflictException('Patrol point sedang tidak aktif');
        }

        await tx.patrolPointNfc.update({
          where: {
            id: oldAssignment.id,
          },

          data: {
            status: NfcAssignmentStatus.REPLACED,

            unassignedAt: new Date(),

            reason: dto.reason?.trim() || 'NFC replaced',
          },
        });

        await tx.nfcTag.update({
          where: {
            id: oldAssignment.nfcTagId,
          },

          data: {
            status: NfcStatus.REPLACED,
          },
        });

        const newAssignment = await tx.patrolPointNfc.create({
          data: {
            patrolPointId: oldAssignment.patrolPointId,

            nfcTagId: dto.newNfcTagId,

            assignedAt: new Date(),

            status: NfcAssignmentStatus.ACTIVE,

            reason: dto.reason?.trim() || 'NFC replacement',

            createdById: oldAssignment.createdById,
          },

          include: this.assignmentInclude(),
        });

        await tx.nfcTag.update({
          where: {
            id: dto.newNfcTagId,
          },

          data: {
            status: NfcStatus.ACTIVE,
          },
        });

        return newAssignment;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async validateNfc(nfcTagId: string) {
    const assignment = await this.prisma.patrolPointNfc.findFirst({
      where: {
        nfcTagId,

        status: NfcAssignmentStatus.ACTIVE,

        nfcTag: {
          status: NfcStatus.ACTIVE,
        },

        patrolPoint: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },

      include: {
        nfcTag: {
          select: {
            id: true,
            uid: true,
            label: true,
            status: true,
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
      },
    });

    if (!assignment) {
      return {
        valid: false,
        reason: 'NFC tidak memiliki assignment aktif',
      };
    }

    return {
      valid: true,
      assignment,
    };
  }

  private assignmentInclude() {
    return {
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

      nfcTag: {
        select: {
          id: true,
          uid: true,
          label: true,
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
    } satisfies Prisma.PatrolPointNfcInclude;
  }
}
