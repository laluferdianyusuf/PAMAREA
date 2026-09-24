import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GpsValidationStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BypassNfcDto } from './dto/bypass-nfc.dto.js';
import { ValidateLocationDto } from './dto/validate-location.dto.js';
import { GpsValidationService } from './services/gps-validation.service.js';
import { NfcValidationService } from './services/nfc-validation.service.js';

@Injectable()
export class PatrolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gpsValidationService: GpsValidationService,
    private readonly nfcValidationService: NfcValidationService,
  ) {}

  async bypassNfc(patrolId: string, userId: string, dto: BypassNfcDto) {
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: patrolId,
      },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    /**
     * Pastikan patrol milik satpam.
     */
    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke patrol ini',
      });
    }

    /**
     * Patrol yang sudah selesai tidak dapat
     * dimodifikasi.
     */
    if (patrol.status === 'SUBMITTED') {
      throw new UnprocessableEntityException({
        code: 'PATROL_ALREADY_SUBMITTED',
        message: 'Patrol sudah disubmit',
      });
    }

    /**
     * RULE UTAMA:
     *
     * Bypass NFC TIDAK berarti bypass GPS.
     */
    if (patrol.gpsValidationStatus !== 'VALID') {
      throw new UnprocessableEntityException({
        code: 'GPS_REQUIRED',
        message: 'GPS harus valid sebelum NFC dapat dibypass',
      });
    }

    /**
     * Kalau NFC sebenarnya sudah valid,
     * tidak perlu bypass.
     */
    if (patrol.nfcValidationStatus === 'VALID') {
      throw new UnprocessableEntityException({
        code: 'NFC_ALREADY_VALID',
        message: 'NFC patrol ini sudah valid',
      });
    }

    /**
     * OTHER wajib mempunyai note.
     */
    if (dto.reason === 'OTHER' && !dto.note?.trim()) {
      throw new UnprocessableEntityException({
        code: 'NFC_BYPASS_NOTE_REQUIRED',
        message: 'Catatan wajib diisi untuk alasan OTHER',
      });
    }

    /**
     * Simpan bypass.
     */
    const updated = await this.prisma.patrol.update({
      where: {
        id: patrolId,
      },
      data: {
        nfcValidationStatus: 'BYPASSED',

        nfcBypass: true,

        nfcBypassReason: dto.reason,

        nfcBypassNote: dto.note?.trim() || null,
      },
    });

    return {
      patrolId: updated.id,

      nfcBypass: updated.nfcBypass,

      nfcValidationStatus: updated.nfcValidationStatus,

      bypassReason: updated.nfcBypassReason,

      bypassNote: updated.nfcBypassNote,

      gpsValidationStatus: updated.gpsValidationStatus,
    };
  }

  async validateLocation(
    patrolId: string,
    userId: string,
    dto: ValidateLocationDto,
  ) {
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

    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke patrol ini',
      });
    }

    if (patrol.status === 'SUBMITTED') {
      throw new UnprocessableEntityException({
        code: 'PATROL_ALREADY_SUBMITTED',
        message: 'Patrol sudah disubmit',
      });
    }

    const point = patrol.patrolPoint;

    const result = this.gpsValidationService.validate(
      dto.latitude,
      dto.longitude,

      Number(point.latitude),
      Number(point.longitude),

      point.radiusMeters,

      dto.accuracy,
    );

    /**
     * Simpan hasil GPS ke patrol.
     */
    await this.prisma.patrol.update({
      where: {
        id: patrolId,
      },

      data: {
        latitude: dto.latitude,

        longitude: dto.longitude,

        gpsAccuracy: dto.accuracy ?? null,

        distanceFromPoint: result.distanceMeters,

        gpsValidationStatus: result.valid
          ? GpsValidationStatus.VALID
          : GpsValidationStatus.UNAVAILABLE,
      },
    });

    /**
     * Jika di luar radius → reject.
     */
    if (!result.valid) {
      throw new UnprocessableEntityException({
        code: 'GPS_OUTSIDE_RADIUS',

        message: 'Posisi Anda berada di luar radius patrol point',

        details: {
          distanceMeters: result.distanceMeters,

          radiusMeters: result.radiusMeters,

          accuracyMeters: result.accuracyMeters,
        },
      });
    }

    return {
      valid: true,

      distanceMeters: result.distanceMeters,

      radiusMeters: result.radiusMeters,

      accuracyMeters: result.accuracyMeters,
    };
  }

  async validateNfc(patrolId: string, userId: string, uid: string) {
    /**
     * GPS harus sudah valid.
     */
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: patrolId,
      },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.gpsValidationStatus !== 'VALID') {
      throw new UnprocessableEntityException({
        code: 'GPS_REQUIRED',
        message: 'Validasi GPS harus berhasil sebelum scan NFC',
      });
    }

    return this.nfcValidationService.validate(patrolId, userId, uid);
  }
}
