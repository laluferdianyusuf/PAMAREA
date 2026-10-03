import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client.js';
import { NfcStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateNfcTagDto } from './dto/create-nfc.dto.js';
import { ReplaceNfcTagDto } from './dto/replace-nfc.dto.js';
import { UpdateNfcTagDto } from './dto/update-nfc.dto.js';

@Injectable()
export class NfcService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNfcTagDto, createdById: string) {
    const uid = this.normalizeUid(dto.uid);

    const existing = await this.prisma.nfcTag.findUnique({
      where: {
        uid,
      },
    });

    if (existing) {
      throw new ConflictException(
        'NFC Tag dengan UID tersebut sudah terdaftar',
      );
    }

    return this.prisma.nfcTag.create({
      data: {
        uid,
        label: dto.label?.trim() || null,
        status: NfcStatus.UNASSIGNED,
        createdById: createdById,
      },

      select: this.detailSelect(),
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
      where: {
        id,
      },

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

  async update(id: string, dto: UpdateNfcTagDto) {
    const existing = await this.getByIdOrThrow(id);

    const data: Prisma.NfcTagUpdateInput = {};

    if (dto.uid !== undefined) {
      const uid = this.normalizeUid(dto.uid);

      if (uid !== existing.uid) {
        const duplicate = await this.prisma.nfcTag.findUnique({
          where: {
            uid,
          },
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
      return this.findOne(id);
    }

    return this.prisma.nfcTag.update({
      where: {
        id,
      },

      data,

      select: this.detailSelect(),
    });
  }

  async markDamaged(id: string) {
    const nfc = await this.getByIdOrThrow(id);

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

    return this.prisma.nfcTag.update({
      where: {
        id,
      },

      data: {
        status: NfcStatus.DAMAGED,
      },

      select: this.detailSelect(),
    });
  }

  async markLost(id: string) {
    const nfc = await this.getByIdOrThrow(id);

    if (nfc.status === NfcStatus.REPLACED) {
      throw new ConflictException(
        'NFC yang sudah REPLACED tidak dapat ditandai LOST',
      );
    }

    return this.prisma.nfcTag.update({
      where: {
        id,
      },

      data: {
        status: NfcStatus.LOST,
      },

      select: this.detailSelect(),
    });
  }

  async activate(id: string) {
    const nfc = await this.getByIdOrThrow(id);

    if (nfc.status === NfcStatus.ACTIVE) {
      return nfc;
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

    return this.prisma.nfcTag.update({
      where: {
        id,
      },

      data: {
        status: NfcStatus.UNASSIGNED,
      },

      select: this.detailSelect(),
    });
  }

  async deactivate(id: string) {
    const nfc = await this.getByIdOrThrow(id);

    if (nfc.status === NfcStatus.REPLACED) {
      throw new ConflictException('NFC yang sudah REPLACED tidak dapat diubah');
    }

    return this.prisma.nfcTag.update({
      where: {
        id,
      },

      data: {
        status: NfcStatus.INACTIVE,
      },

      select: this.detailSelect(),
    });
  }

  async replace(oldNfcId: string, dto: ReplaceNfcTagDto) {
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

      await tx.nfcTag.update({
        where: {
          id: oldNfc.id,
        },

        data: {
          status: NfcStatus.REPLACED,
        },
      });

      const updated = await tx.nfcTag.update({
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

      return {
        oldNfcId: oldNfc.id,
        newNfc: updated,
      };
    });
  }

  async remove(id: string) {
    const nfc = await this.getByIdOrThrow(id);

    if (nfc.status === NfcStatus.ACTIVE) {
      throw new ConflictException('NFC yang masih ACTIVE tidak dapat dihapus');
    }

    return this.prisma.nfcTag.update({
      where: {
        id,
      },

      data: {
        status: NfcStatus.INACTIVE,
      },

      select: this.detailSelect(),
    });
  }

  private async getByIdOrThrow(id: string) {
    const nfc = await this.prisma.nfcTag.findUnique({
      where: {
        id,
      },
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
