import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class NfcValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(patrolId: string, userId: string, uid: string) {
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: patrolId,
      },
      include: {
        patrolPoint: true,
      },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    /**
     * Pastikan patrol memang milik satpam
     * yang sedang melakukan request.
     */
    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Patrol bukan milik user ini',
      });
    }

    /**
     * Patrol yang sudah submit tidak boleh
     * divalidasi ulang.
     */
    if (patrol.status === 'SUBMITTED') {
      throw new UnprocessableEntityException({
        code: 'PATROL_ALREADY_SUBMITTED',
        message: 'Patrol sudah disubmit',
      });
    }

    const normalizedUid = uid.trim().toUpperCase();

    /**
     * Cari NFC berdasarkan UID.
     */
    const nfcTag = await this.prisma.nfcTag.findUnique({
      where: {
        uid: normalizedUid,
      },
    });

    if (!nfcTag) {
      throw new UnprocessableEntityException({
        code: 'NFC_NOT_FOUND',
        message: 'NFC tidak terdaftar',
      });
    }

    /**
     * NFC harus ACTIVE.
     */
    if (nfcTag.status !== 'ACTIVE') {
      throw new UnprocessableEntityException({
        code: 'NFC_INACTIVE',
        message: 'NFC tidak aktif',
      });
    }

    /**
     * Cari hubungan NFC dengan patrol point.
     *
     * Ini yang memastikan NFC tersebut benar-benar
     * milik patrol point yang sedang dipatroli.
     */
    const assignment = await this.prisma.patrolPointNfc.findFirst({
      where: {
        nfcTagId: nfcTag.id,

        patrolPointId: patrol.patrolPointId,

        status: 'ACTIVE',

        unassignedAt: null,
      },
    });

    if (!assignment) {
      throw new UnprocessableEntityException({
        code: 'NFC_WRONG_POINT',
        message: 'NFC tidak sesuai dengan patrol point ini',
      });
    }

    /**
     * Simpan snapshot NFC ke patrol.
     *
     * Penting:
     * jangan hanya menyimpan relasi NFC.
     *
     * UID snapshot dibutuhkan untuk historical evidence.
     */
    const updated = await this.prisma.patrol.update({
      where: {
        id: patrolId,
      },
      data: {
        nfcTagId: nfcTag.id,

        nfcUidSnapshot: nfcTag.uid,

        nfcValidationStatus: 'VALID',

        nfcBypass: false,

        nfcBypassReason: null,

        nfcBypassNote: null,
      },
    });

    return {
      patrolId: updated.id,

      valid: true,

      nfcTagId: nfcTag.id,

      uid: nfcTag.uid,

      validationStatus: updated.nfcValidationStatus,
    };
  }
}
