import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import { AuditLogService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class EmergencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private getBroadcastStatus(
    successCount: number,
    failureCount: number,
  ): 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' {
    if (failureCount === 0) return 'SUCCESS';
    if (successCount > 0) return 'PARTIAL_SUCCESS';
    return 'FAILED';
  }

  private isInvalidFcmToken(errorCode?: string): boolean {
    return (
      errorCode === 'messaging/registration-token-not-registered' ||
      errorCode === 'messaging/invalid-registration-token'
    );
  }

  private async deactivateInvalidTokens(tokens: string[]) {
    const uniqueTokens = [...new Set(tokens)];

    if (uniqueTokens.length === 0) return;

    try {
      const result = await this.prisma.userDevice.updateMany({
        where: {
          deviceIdentifier: {
            in: uniqueTokens,
          },
          status: 'ACTIVE',
        },
        data: {
          status: 'INACTIVE',
        },
      });

      console.log('[FCM] Invalid tokens cleaned:', {
        invalidTokenCount: uniqueTokens.length,
        deactivatedDevices: result.count,
      });
    } catch (error) {
      console.error('[FCM] Gagal membersihkan invalid tokens:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async broadcastEmergency(
    senderId: string,
    siteId: string,
    locationData: {
      latitude?: number;
      longitude?: number;
      note?: string;
    },
  ) {
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: {
        id: true,
        fullName: true,
        siteId: true,
      },
    });

    if (!sender) {
      throw new InternalServerErrorException(
        'Pengirim peringatan darurat tidak ditemukan',
      );
    }

    const targetGuards = await this.prisma.user.findMany({
      where: {
        siteId,
        status: 'ACTIVE',
      },
      include: {
        devices: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            deviceIdentifier: true,
          },
        },
      },
    });

    const fcmTokens = [
      ...new Set(
        targetGuards.flatMap((guard) =>
          guard.devices
            .map((device) => device.deviceIdentifier)
            .filter((token): token is string => Boolean(token)),
        ),
      ),
    ];

    if (fcmTokens.length === 0) {
      await this.writeAuditLog({
        userId: senderId,
        action: 'BROADCAST_EMERGENCY',
        entityType: 'EMERGENCY_ALERT',
        newData: {
          siteId,
          status: 'NO_ACTIVE_DEVICES',
          totalDevices: 0,
        },
      });

      return {
        status: 'NO_ACTIVE_GUARDS',
        message: 'Tidak ada perangkat satpam aktif di site ini saat ini.',
        totalDevices: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    try {
      const result = await this.sendFcmEmergencyAlert(
        fcmTokens,
        sender.fullName,
        locationData,
      );

      const status = this.getBroadcastStatus(
        result.successCount,
        result.failureCount,
      );

      await this.writeAuditLog({
        userId: senderId,
        action: 'BROADCAST_EMERGENCY',
        entityType: 'EMERGENCY_ALERT',
        newData: {
          siteId,
          status,
          totalDevices: fcmTokens.length,
          successCount: result.successCount,
          failureCount: result.failureCount,
          latitude: locationData.latitude ?? null,
          longitude: locationData.longitude ?? null,
          hasNote: Boolean(locationData.note),
          timestamp: new Date().toISOString(),
        },
      });

      return {
        status,
        message: `Peringatan darurat diproses untuk ${fcmTokens.length} perangkat.`,
        totalDevices: fcmTokens.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
      };
    } catch (error) {
      await this.writeAuditLog({
        userId: senderId,
        action: 'BROADCAST_EMERGENCY',
        entityType: 'EMERGENCY_ALERT',
        newData: {
          siteId,
          status: 'FAILED',
          totalDevices: fcmTokens.length,
          error: error instanceof Error ? error.message : 'Unknown FCM error',
          timestamp: new Date().toISOString(),
        },
      });

      throw new InternalServerErrorException(
        'Gagal memproses peringatan darurat',
      );
    }
  }

  async broadcastPatrolWarning(
    senderId: string,
    data: {
      siteId: string;
      reportNumber: string;
      patrolPointName: string;
      unsafeAnswers: {
        question: string;
        answer: string;
      }[];
    },
  ) {
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: {
        fullName: true,
      },
    });

    if (!sender) {
      throw new InternalServerErrorException(
        'Pengirim peringatan tidak ditemukan',
      );
    }

    const targetGuards = await this.prisma.user.findMany({
      where: {
        siteId: data.siteId,
        role: {
          name: {
            in: ['ADMIN', 'SECURITY', 'CHIEF_SECURITY', 'DANRU_SECURITY'],
          },
        },
        status: 'ACTIVE',
      },
      select: {
        devices: {
          where: { status: 'ACTIVE' },
          select: {
            deviceIdentifier: true,
          },
        },
      },
    });

    const tokens = [
      ...new Set(
        targetGuards.flatMap((guard) =>
          guard.devices
            .map((device) => device.deviceIdentifier)
            .filter((token): token is string => Boolean(token)),
        ),
      ),
    ];

    if (tokens.length === 0) {
      await this.writeAuditLog({
        userId: senderId,
        action: 'BROADCAST_PATROL_WARNING',
        entityType: 'PATROL_WARNING',
        newData: {
          siteId: data.siteId,
          reportNumber: data.reportNumber,
          patrolPointName: data.patrolPointName,
          unsafeCount: data.unsafeAnswers.length,
          status: 'NO_ACTIVE_DEVICES',
          totalDevices: 0,
        },
      });

      return {
        status: 'NO_ACTIVE_DEVICES',
        totalDevices: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    const unsafeSummary = data.unsafeAnswers
      .map(
        (item, index) =>
          `${index + 1}. ${item.question} — Jawaban: ${item.answer}`,
      )
      .join('\n');

    const payload: MulticastMessage = {
      tokens: [],
      notification: {
        title: 'Peringatan Hasil Patroli',
        body: `${data.unsafeAnswers.length} jawaban perlu diperiksa di titik ${data.patrolPointName}.`,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'patrol_warning',
          sound: 'default',
        },
      },
      data: {
        type: 'PATROL_WARNING',
        senderName: sender.fullName,
        siteId: data.siteId,
        reportNumber: data.reportNumber,
        patrolPointName: data.patrolPointName,
        unsafeCount: String(data.unsafeAnswers.length),
        unsafeAnswers: JSON.stringify(data.unsafeAnswers),
        summary: unsafeSummary,
        timestamp: new Date().toISOString(),
      },
    };

    let successCount = 0;
    let failureCount = 0;

    const invalidTokens: string[] = [];

    try {
      for (let i = 0; i < tokens.length; i += 500) {
        const batch = tokens.slice(i, i + 500);

        const response = await getMessaging().sendEachForMulticast({
          ...payload,
          tokens: batch,
        });

        successCount += response.successCount;
        failureCount += response.failureCount;

        console.log('[PATROL WARNING] Batch result:', {
          batchSize: batch.length,
          successCount: response.successCount,
          failureCount: response.failureCount,
        });

        response.responses.forEach((result, index) => {
          if (!result.success) {
            const errorCode = result.error?.code;

            console.error('[PATROL WARNING] FCM gagal:', {
              tokenIndex: i + index,
              errorCode,
              error: result.error?.message,
            });

            if (this.isInvalidFcmToken(errorCode)) {
              invalidTokens.push(batch[index]);
            }
          }
        });
      }

      await this.deactivateInvalidTokens(invalidTokens);

      const status = this.getBroadcastStatus(successCount, failureCount);

      await this.writeAuditLog({
        userId: senderId,
        action: 'BROADCAST_PATROL_WARNING',
        entityType: 'PATROL_WARNING',
        newData: {
          siteId: data.siteId,
          reportNumber: data.reportNumber,
          patrolPointName: data.patrolPointName,
          unsafeCount: data.unsafeAnswers.length,
          totalDevices: tokens.length,
          successCount,
          failureCount,
          status,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        status,
        totalDevices: tokens.length,
        successCount,
        failureCount,
      };
    } catch (error) {
      await this.writeAuditLog({
        userId: senderId,
        action: 'BROADCAST_PATROL_WARNING',
        entityType: 'PATROL_WARNING',
        newData: {
          siteId: data.siteId,
          reportNumber: data.reportNumber,
          patrolPointName: data.patrolPointName,
          unsafeCount: data.unsafeAnswers.length,
          totalDevices: tokens.length,
          successCount,
          failureCount,
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown FCM error',
          timestamp: new Date().toISOString(),
        },
      });

      throw error;
    }
  }

  private async sendFcmEmergencyAlert(
    tokens: string[],
    senderName: string,
    locationData: {
      latitude?: number;
      longitude?: number;
      note?: string;
    },
  ) {
    const preparedAt = new Date().toISOString();
    const invalidTokens: string[] = [];

    const payload: Omit<MulticastMessage, 'tokens'> = {
      android: {
        priority: 'high',
        ttl: 60 * 1000,
      },
      data: {
        type: 'EMERGENCY_ALERT',
        senderName,
        timestamp: preparedAt,
        ...(locationData.latitude != null
          ? { latitude: String(locationData.latitude) }
          : {}),
        ...(locationData.longitude != null
          ? { longitude: String(locationData.longitude) }
          : {}),
        ...(locationData.note ? { note: locationData.note } : {}),
      },
    };

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const batchStartedAt = Date.now();

      const response = await getMessaging().sendEachForMulticast({
        ...payload,
        tokens: batch,
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      console.log('[SOS BACKEND] Batch result:', {
        batchSize: batch.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        durationMs: Date.now() - batchStartedAt,
      });

      response.responses.forEach((result, index) => {
        if (!result.success) {
          const errorCode = result.error?.code;

          console.error('[SOS BACKEND] FCM gagal:', {
            tokenIndex: i + index,
            errorCode,
            error: result.error?.message,
          });

          if (this.isInvalidFcmToken(errorCode)) {
            invalidTokens.push(batch[index]);
          }
        }
      });
    }

    await this.deactivateInvalidTokens(invalidTokens);

    console.log('[SOS BACKEND] FCM result:', {
      preparedAt,
      completedAt: new Date().toISOString(),
      totalDevices: tokens.length,
      successCount,
      failureCount,
    });

    return {
      successCount,
      failureCount,
    };
  }

  private async writeAuditLog(data: {
    userId: string;
    action: string;
    entityType: string;
    entityId?: string;
    oldData?: Prisma.InputJsonValue;
    newData?: Prisma.InputJsonValue;
  }) {
    await this.prisma.$transaction(async (tx) => {
      await this.auditLogService.createAudit(tx, data);
    });
  }
}
