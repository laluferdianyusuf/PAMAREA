import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class EmergencyService {
  constructor(private readonly prisma: PrismaService) {}

  async broadcastEmergency(
    senderId: string,
    siteId: string,
    locationData: { latitude?: number; longitude?: number; note?: string },
  ) {
    try {
      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
      });

      if (!sender) {
        throw new Error('Pengirim tidak ditemukan');
      }

      const targetGuards = await this.prisma.user.findMany({
        where: {
          siteId: siteId,
          role: { name: 'SECURITY' },
          status: 'ACTIVE',
          // id: { not: senderId },
        },
        include: {
          devices: {
            where: { status: 'ACTIVE' },
          },
        },
      });

      const fcmTokens: string[] = [];
      targetGuards.forEach((guard) => {
        guard.devices.forEach((device) => {
          if (device.deviceIdentifier) {
            fcmTokens.push(device.deviceIdentifier);
          }
        });
      });

      if (fcmTokens.length === 0) {
        return {
          status: 'NO_ACTIVE_GUARDS',
          message: 'Tidak ada satpam lain yang aktif di site ini saat ini.',
        };
      }

      await this.sendFcmEmergencyAlert(
        fcmTokens,
        sender.fullName,
        locationData,
      );

      return {
        status: 'SUCCESS',
        message: `Peringatan darurat berhasil dikirim ke ${fcmTokens.length} perangkat.`,
      };
    } catch (error) {
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
      throw new Error('Pengirim peringatan tidak ditemukan');
    }

    const targetGuards = await this.prisma.user.findMany({
      where: {
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
      return {
        status: 'NO_ACTIVE_DEVICES',
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
        body:
          `${data.unsafeAnswers.length} jawaban perlu diperiksa ` +
          `di titik ${data.patrolPointName}.`,
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

    return {
      status: 'SUCCESS',
      totalDevices: tokens.length,
      successCount,
      failureCount,
    };
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
      tokens,
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

    const startedAt = Date.now();

    try {
      const response = await getMessaging().sendEachForMulticast(payload);

      console.log('[SOS BACKEND] FCM result:', {
        senderName,
        preparedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        successCount: response.successCount,
        failureCount: response.failureCount,
      });

      response.responses.forEach((result, index) => {
        if (!result.success) {
          console.error('[SOS BACKEND] FCM failed:', {
            tokenIndex: index,
            error: result.error?.message,
          });
        }
      });
    } catch (error) {
      throw error;
    }
  }
}
