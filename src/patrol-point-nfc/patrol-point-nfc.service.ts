import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditLogService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NfcAssignmentStatus, NfcStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssignNfcDto } from './dto/assign-nfc.dto.js';
import { RemoveNfcAssignmentDto } from './dto/remove-nfc-assignment.dto.js';
import { ReplaceNfcAssignmentDto } from './dto/replace-nfc-assignment.dto.js';

@Injectable()
export class PatrolPointNfcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

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

        if (patrolPoint.deletedAt) {
          throw new ConflictException('Patrol point sudah dihapus');
        }

        if (patrolPoint.status !== 'INACTIVE') {
          throw new ConflictException(`Patrol point sudah aktif`);
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
            `NFC Tag tidak dapat di-assign karena statusnya ${nfcTag.status}. NFC harus UNASSIGNED.`,
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
            createdById,
          },
          include: this.assignmentInclude(),
        });

        const updatedPatrolPoint = await tx.patrolPoint.update({
          where: {
            id: dto.patrolPointId,
          },
          data: {
            status: 'ACTIVE',
          },
        });

        const updatedNfcTag = await tx.nfcTag.update({
          where: {
            id: dto.nfcTagId,
          },
          data: {
            status: NfcStatus.ACTIVE,
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId: createdById,
          action: 'ASSIGN_NFC_TO_PATROL_POINT',
          entityType: 'PatrolPointNfc',
          entityId: assignment.id,
          oldData: {
            patrolPointId: patrolPoint.id,
            patrolPointStatus: patrolPoint.status,
            nfcTagId: nfcTag.id,
            nfcTagUid: nfcTag.uid,
            nfcTagStatus: nfcTag.status,
          },
          newData: {
            assignmentId: assignment.id,
            patrolPointId: updatedPatrolPoint.id,
            patrolPointStatus: updatedPatrolPoint.status,
            nfcTagId: updatedNfcTag.id,
            nfcTagUid: updatedNfcTag.uid,
            nfcTagStatus: updatedNfcTag.status,
            assignmentStatus: assignment.status,
          },
        });

        return assignment;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async unassign(
    patrolPointId: string,
    dto: RemoveNfcAssignmentDto,
    actorId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const patrolPoint = await tx.patrolPoint.findUnique({
          where: {
            id: patrolPointId,
          },
        });

        if (!patrolPoint) {
          throw new NotFoundException('Patrol point tidak ditemukan');
        }

        const assignment = await tx.patrolPointNfc.findFirst({
          where: {
            patrolPointId,
            status: NfcAssignmentStatus.ACTIVE,
          },
        });

        if (!assignment) {
          throw new NotFoundException('Patrol point tidak memiliki NFC aktif');
        }

        const nfcTag = await tx.nfcTag.findUnique({
          where: {
            id: assignment.nfcTagId,
          },
        });

        if (!nfcTag) {
          throw new NotFoundException('NFC Tag tidak ditemukan');
        }

        const updatedAssignment = await tx.patrolPointNfc.update({
          where: {
            id: assignment.id,
          },
          data: {
            status: NfcAssignmentStatus.REMOVED,
            unassignedAt: new Date(),
            reason: dto.reason?.trim() || 'Assignment removed',
          },
          include: this.assignmentInclude(),
        });

        const updatedNfcTag = await tx.nfcTag.update({
          where: {
            id: nfcTag.id,
          },
          data: {
            status: NfcStatus.UNASSIGNED,
          },
        });

        const updatedPatrolPoint = await tx.patrolPoint.update({
          where: {
            id: patrolPointId,
          },
          data: {
            status: 'INACTIVE',
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'REMOVE_NFC_ASSIGNMENT',
          entityType: 'PatrolPointNfc',
          entityId: assignment.id,
          oldData: {
            assignmentId: assignment.id,
            assignmentStatus: assignment.status,

            patrolPointId: patrolPoint.id,
            patrolPointStatus: patrolPoint.status,

            nfcTagId: nfcTag.id,
            nfcTagUid: nfcTag.uid,
            nfcTagStatus: nfcTag.status,
          },
          newData: {
            assignmentId: updatedAssignment.id,
            assignmentStatus: updatedAssignment.status,

            patrolPointId: updatedPatrolPoint.id,
            patrolPointStatus: updatedPatrolPoint.status,

            nfcTagId: updatedNfcTag.id,
            nfcTagUid: updatedNfcTag.uid,
            nfcTagStatus: updatedNfcTag.status,

            reason: updatedAssignment.reason,
            unassignedAt: updatedAssignment.unassignedAt,
          },
        });

        return updatedAssignment;
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

  async remove(id: string, dto: RemoveNfcAssignmentDto, actorId: string) {
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

        const nfcTag = await tx.nfcTag.findUnique({
          where: {
            id: assignment.nfcTagId,
          },
        });

        if (!nfcTag) {
          throw new NotFoundException('NFC Tag tidak ditemukan');
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

        const updatedNfcTag = await tx.nfcTag.update({
          where: {
            id: assignment.nfcTagId,
          },
          data: {
            status: NfcStatus.UNASSIGNED,
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'REMOVE_NFC_ASSIGNMENT',
          entityType: 'PatrolPointNfc',
          entityId: assignment.id,
          oldData: {
            patrolPointId: assignment.patrolPointId,
            nfcTagId: assignment.nfcTagId,
            nfcTagUid: nfcTag.uid,
            assignmentStatus: assignment.status,
            nfcTagStatus: nfcTag.status,
          },
          newData: {
            patrolPointId: updated.patrolPointId,
            nfcTagId: updated.nfcTagId,
            nfcTagUid: nfcTag.uid,
            assignmentStatus: updated.status,
            nfcTagStatus: updatedNfcTag.status,
            reason: updated.reason,
          },
        });

        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async replace(
    assignmentId: string,
    dto: ReplaceNfcAssignmentDto,
    actorId: string,
  ) {
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

        const oldNfc = await tx.nfcTag.findUnique({
          where: {
            id: oldAssignment.nfcTagId,
          },
        });

        if (!oldNfc) {
          throw new NotFoundException('NFC lama tidak ditemukan');
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

        const replacedAssignment = await tx.patrolPointNfc.update({
          where: {
            id: oldAssignment.id,
          },
          data: {
            status: NfcAssignmentStatus.REPLACED,
            unassignedAt: new Date(),
            reason: dto.reason?.trim() || 'NFC replaced',
          },
        });

        const replacedNfc = await tx.nfcTag.update({
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

        const activatedNfc = await tx.nfcTag.update({
          where: {
            id: dto.newNfcTagId,
          },
          data: {
            status: NfcStatus.ACTIVE,
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'REPLACE_NFC_ASSIGNMENT',
          entityType: 'PatrolPointNfc',
          entityId: oldAssignment.id,
          oldData: {
            assignmentId: oldAssignment.id,
            patrolPointId: oldAssignment.patrolPointId,
            nfcTagId: oldNfc.id,
            nfcTagUid: oldNfc.uid,
            assignmentStatus: oldAssignment.status,
            nfcTagStatus: oldNfc.status,
          },
          newData: {
            oldAssignmentId: replacedAssignment.id,
            oldAssignmentStatus: replacedAssignment.status,
            oldNfcId: replacedNfc.id,
            oldNfcUid: replacedNfc.uid,
            oldNfcStatus: replacedNfc.status,
            newAssignmentId: newAssignment.id,
            newAssignmentStatus: newAssignment.status,
            newNfcId: activatedNfc.id,
            newNfcUid: activatedNfc.uid,
            newNfcStatus: activatedNfc.status,
            patrolPointId: patrolPoint.id,
            reason: dto.reason?.trim() || 'NFC replacement',
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
