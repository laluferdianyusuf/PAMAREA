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
      select: { id: true, fullName: true, siteId: true },
    });

    if (!sender) {
      throw new InternalServerErrorException(
        'Pengirim peringatan darurat tidak ditemukan',
      );
    }

    const targetGuards = await this.prisma.user.findMany({
      where: {
        siteId,
        role: { name: 'SECURITY' },
        status: 'ACTIVE',
      },
      include: {
        devices: {
          where: { status: 'ACTIVE' },
          select: { deviceIdentifier: true },
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
      };
    }

    try {
      const result = await this.sendFcmEmergencyAlert(
        fcmTokens,
        sender.fullName,
        locationData,
      );

      await this.writeAuditLog({
        userId: senderId,
        action: 'BROADCAST_EMERGENCY',
        entityType: 'EMERGENCY_ALERT',
        newData: {
          siteId,
          status: 'SUCCESS',
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
        status: 'SUCCESS',
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
      select: { fullName: true },
    });

    if (!sender) {
      throw new InternalServerErrorException(
        'Pengirim peringatan tidak ditemukan',
      );
    }

    const targetGuards = await this.prisma.user.findMany({
      where: {
        siteId: data.siteId,
        role: { name: 'SECURITY' },
        status: 'ACTIVE',
      },
      select: {
        devices: {
          where: { status: 'ACTIVE' },
          select: { deviceIdentifier: true },
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

    try {
      for (let i = 0; i < tokens.length; i += 500) {
        const batch = tokens.slice(i, i + 500);

        const response = await getMessaging().sendEachForMulticast({
          ...payload,
          tokens: batch,
        });

        successCount += response.successCount;
        failureCount += response.failureCount;

        response.responses.forEach((result, index) => {
          if (!result.success) {
            console.error('[PATROL WARNING] FCM gagal:', {
              tokenIndex: i + index,
              error: result.error?.message,
            });
          }
        });
      }

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
          status: 'SUCCESS',
          timestamp: new Date().toISOString(),
        },
      });

      return {
        status: 'SUCCESS',
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

    const payload: MulticastMessage = {
      tokens: [],
      notification: {
        title: 'DARURAT SOS PAMAREA',
        body: `${senderName} mengirim peringatan darurat. Segera periksa.`,
      },
      android: {
        priority: 'high',
        ttl: 60 * 1000,
        notification: {
          channelId: 'emergency_channel_v2',
          priority: 'max',
          visibility: 'public',
        },
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
          console.error('[SOS BACKEND] FCM gagal:', {
            tokenIndex: i + index,
            errorCode: result.error?.code,
            error: result.error?.message,
          });
        }
      });
    }

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
