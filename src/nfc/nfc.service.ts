import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditLogService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NfcStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateNfcTagDto } from './dto/create-nfc.dto.js';
import { ReplaceNfcTagDto } from './dto/replace-nfc.dto.js';
import { UpdateNfcTagDto } from './dto/update-nfc.dto.js';

@Injectable()
export class NfcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateNfcTagDto, createdById: string) {
    const uid = this.normalizeUid(dto.uid);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.nfcTag.findUnique({
        where: { uid },
      });

      if (existing) {
        throw new ConflictException(
          'NFC Tag dengan UID tersebut sudah terdaftar',
        );
      }

      const created = await tx.nfcTag.create({
        data: {
          uid,
          label: dto.label?.trim() || null,
          status: NfcStatus.UNASSIGNED,
          createdById,
        },
        select: this.detailSelect(),
      });

      await this.auditLogService.createAudit(tx, {
        userId: createdById,
        action: 'CREATE_NFC_TAG',
        entityType: 'NfcTag',
        entityId: created.id,
        newData: {
          uid: created.uid,
          label: created.label,
          status: created.status,
        },
      });

      return created;
    });
  }

  async findAll(status?: NfcStatus) {
    return this.prisma.nfcTag.findMany({
      where: {
        ...(status ? { status } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: this.listSelect(),
    });
  }

  async findUnassigned() {
    return this.prisma.nfcTag.findMany({
      where: {
        status: NfcStatus.UNASSIGNED,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        uid: true,
        label: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: string) {
    const nfcTag = await this.prisma.nfcTag.findUnique({
      where: { id },
      select: this.detailSelect(),
    });

    if (!nfcTag) {
      throw new NotFoundException('NFC Tag tidak ditemukan');
    }

    return nfcTag;
  }

  async findByUid(uid: string) {
    const normalizedUid = this.normalizeUid(uid);

    const nfcTag = await this.prisma.nfcTag.findUnique({
      where: {
        uid: normalizedUid,
      },
      select: {
        id: true,
        uid: true,
        label: true,
        status: true,
      },
    });

    if (!nfcTag) {
      throw new NotFoundException('NFC Tag tidak terdaftar');
    }

    return nfcTag;
  }

  async update(id: string, dto: UpdateNfcTagDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.nfcTag.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException('NFC Tag tidak ditemukan');
      }

      const data: Prisma.NfcTagUpdateInput = {};

      if (dto.uid !== undefined) {
        const uid = this.normalizeUid(dto.uid);

        if (uid !== existing.uid) {
          const duplicate = await tx.nfcTag.findUnique({
            where: { uid },
          });

          if (duplicate) {
            throw new ConflictException('UID NFC tersebut sudah digunakan');
          }

          data.uid = uid;
        }
      }

      if (dto.label !== undefined) {
        data.label = dto.label.trim() || null;
      }

      if (Object.keys(data).length === 0) {
        return tx.nfcTag.findUniqueOrThrow({
          where: { id },
          select: this.detailSelect(),
        });
      }

      const updated = await tx.nfcTag.update({
        where: { id },
        data,
        select: this.detailSelect(),
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'UPDATE_NFC_TAG',
        entityType: 'NfcTag',
        entityId: id,
        oldData: {
          uid: existing.uid,
          label: existing.label,
          status: existing.status,
        },
        newData: {
          uid: updated.uid,
          label: updated.label,
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async markDamaged(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const nfc = await tx.nfcTag.findUnique({
        where: { id },
      });

      if (!nfc) {
        throw new NotFoundException('NFC Tag tidak ditemukan');
      }

      if (nfc.status === NfcStatus.LOST) {
        throw new ConflictException(
          'NFC yang berstatus LOST tidak dapat ditandai DAMAGED',
        );
      }

      if (nfc.status === NfcStatus.REPLACED) {
        throw new ConflictException(
          'NFC yang sudah REPLACED tidak dapat digunakan lagi',
        );
      }

      if (nfc.status === NfcStatus.INACTIVE) {
        throw new ConflictException('NFC sedang INACTIVE');
      }

      if (nfc.status === NfcStatus.DAMAGED) {
        return tx.nfcTag.findUniqueOrThrow({
          where: { id },
          select: this.detailSelect(),
        });
      }

      const updated = await tx.nfcTag.update({
        where: { id },
        data: {
          status: NfcStatus.DAMAGED,
        },
        select: this.detailSelect(),
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'MARK_NFC_DAMAGED',
        entityType: 'NfcTag',
        entityId: id,
        oldData: {
          status: nfc.status,
        },
        newData: {
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async markLost(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const nfc = await tx.nfcTag.findUnique({
        where: { id },
      });

      if (!nfc) {
        throw new NotFoundException('NFC Tag tidak ditemukan');
      }

      if (nfc.status === NfcStatus.REPLACED) {
        throw new ConflictException(
          'NFC yang sudah REPLACED tidak dapat ditandai LOST',
        );
      }

      if (nfc.status === NfcStatus.LOST) {
        return tx.nfcTag.findUniqueOrThrow({
          where: { id },
          select: this.detailSelect(),
        });
      }

      const updated = await tx.nfcTag.update({
        where: { id },
        data: {
          status: NfcStatus.LOST,
        },
        select: this.detailSelect(),
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'MARK_NFC_LOST',
        entityType: 'NfcTag',
        entityId: id,
        oldData: {
          status: nfc.status,
        },
        newData: {
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async activate(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const nfc = await tx.nfcTag.findUnique({
        where: { id },
      });

      if (!nfc) {
        throw new NotFoundException('NFC Tag tidak ditemukan');
      }

      if (nfc.status === NfcStatus.ACTIVE) {
        return tx.nfcTag.findUniqueOrThrow({
          where: { id },
          select: this.detailSelect(),
        });
      }

      if (nfc.status === NfcStatus.DAMAGED) {
        throw new ConflictException('NFC rusak tidak dapat diaktifkan');
      }

      if (nfc.status === NfcStatus.LOST) {
        throw new ConflictException('NFC hilang tidak dapat diaktifkan');
      }

      if (nfc.status === NfcStatus.REPLACED) {
        throw new ConflictException(
          'NFC yang sudah REPLACED tidak dapat diaktifkan',
        );
      }

      const updated = await tx.nfcTag.update({
        where: { id },
        data: {
          status: NfcStatus.UNASSIGNED,
        },
        select: this.detailSelect(),
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'ACTIVATE_NFC',
        entityType: 'NfcTag',
        entityId: id,
        oldData: {
          status: nfc.status,
        },
        newData: {
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async deactivate(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const nfc = await tx.nfcTag.findUnique({
        where: { id },
      });

      if (!nfc) {
        throw new NotFoundException('NFC Tag tidak ditemukan');
      }

      if (nfc.status === NfcStatus.REPLACED) {
        throw new ConflictException(
          'NFC yang sudah REPLACED tidak dapat diubah',
        );
      }

      if (nfc.status === NfcStatus.INACTIVE) {
        return tx.nfcTag.findUniqueOrThrow({
          where: { id },
          select: this.detailSelect(),
        });
      }

      const updated = await tx.nfcTag.update({
        where: { id },
        data: {
          status: NfcStatus.INACTIVE,
        },
        select: this.detailSelect(),
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'DEACTIVATE_NFC',
        entityType: 'NfcTag',
        entityId: id,
        oldData: {
          status: nfc.status,
        },
        newData: {
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async replace(oldNfcId: string, dto: ReplaceNfcTagDto, actorId: string) {
    if (oldNfcId === dto.newNfcTagId) {
      throw new ConflictException('NFC lama dan NFC baru tidak boleh sama');
    }

    return this.prisma.$transaction(async (tx) => {
      const oldNfc = await tx.nfcTag.findUnique({
        where: {
          id: oldNfcId,
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
        throw new ConflictException('NFC baru harus berstatus UNASSIGNED');
      }

      const replacedOldNfc = await tx.nfcTag.update({
        where: {
          id: oldNfc.id,
        },
        data: {
          status: NfcStatus.REPLACED,
        },
        select: {
          id: true,
          uid: true,
          label: true,
          status: true,
        },
      });

      const updatedNewNfc = await tx.nfcTag.update({
        where: {
          id: newNfc.id,
        },
        data: {
          status: NfcStatus.ACTIVE,
        },
        select: {
          id: true,
          uid: true,
          label: true,
          status: true,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'REPLACE_NFC_TAG',
        entityType: 'NfcTag',
        entityId: oldNfc.id,
        oldData: {
          uid: oldNfc.uid,
          label: oldNfc.label,
          status: oldNfc.status,
        },
        newData: {
          replacedByNfcId: updatedNewNfc.id,
          replacedByUid: updatedNewNfc.uid,
          status: replacedOldNfc.status,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'RECEIVE_REPLACEMENT_NFC_TAG',
        entityType: 'NfcTag',
        entityId: updatedNewNfc.id,
        oldData: {
          uid: newNfc.uid,
          label: newNfc.label,
          status: newNfc.status,
        },
        newData: {
          uid: updatedNewNfc.uid,
          label: updatedNewNfc.label,
          status: updatedNewNfc.status,
          replacesNfcId: replacedOldNfc.id,
        },
      });

      return {
        oldNfcId: replacedOldNfc.id,
        newNfc: updatedNewNfc,
      };
    });
  }

  async remove(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const nfc = await tx.nfcTag.findUnique({
        where: { id },
      });

      if (!nfc) {
        throw new NotFoundException('NFC Tag tidak ditemukan');
      }

      if (nfc.status === NfcStatus.ACTIVE) {
        throw new ConflictException(
          'NFC yang masih ACTIVE tidak dapat dihapus',
        );
      }

      if (nfc.status === NfcStatus.INACTIVE) {
        return tx.nfcTag.findUniqueOrThrow({
          where: { id },
          select: this.detailSelect(),
        });
      }

      const updated = await tx.nfcTag.update({
        where: { id },
        data: {
          status: NfcStatus.INACTIVE,
        },
        select: this.detailSelect(),
      });

      await this.auditLogService.createAudit(tx, {
        userId: actorId,
        action: 'REMOVE_NFC_TAG',
        entityType: 'NfcTag',
        entityId: id,
        oldData: {
          uid: nfc.uid,
          label: nfc.label,
          status: nfc.status,
        },
        newData: {
          uid: updated.uid,
          label: updated.label,
          status: updated.status,
        },
      });

      return updated;
    });
  }

  private async getByIdOrThrow(id: string) {
    const nfc = await this.prisma.nfcTag.findUnique({
      where: { id },
    });

    if (!nfc) {
      throw new NotFoundException('NFC Tag tidak ditemukan');
    }

    return nfc;
  }

  private normalizeUid(uid: string): string {
    return uid.trim().toUpperCase();
  }

  private listSelect() {
    return {
      id: true,
      uid: true,
      label: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      createdBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
      assignments: {
        select: {
          status: true,
          unassignedAt: true,
          patrolPoint: {
            select: {
              id: true,
              name: true,
              code: true,
              status: true,
            },
          },
        },
      },
      _count: {
        select: {
          assignments: true,
          patrols: true,
        },
      },
    } satisfies Prisma.NfcTagSelect;
  }

  private detailSelect() {
    return {
      id: true,
      uid: true,
      label: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      createdBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
      assignments: {
        select: {
          id: true,
          patrolPointId: true,
          assignedAt: true,
          unassignedAt: true,
          status: true,
          patrolPoint: {
            select: {
              id: true,
              code: true,
              name: true,
              siteId: true,
            },
          },
        },
      },
      _count: {
        select: {
          assignments: true,
          patrols: true,
        },
      },
    } satisfies Prisma.NfcTagSelect;
  }
}
