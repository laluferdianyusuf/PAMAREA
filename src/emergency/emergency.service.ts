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

      // Cari semua Satpam Aktif di Site yang sama, KECUALI si pelapor
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

      // Kirim Push Notification beserta data lokasi pelapor
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
      console.error('Error on broadcastEmergency:', error);
      throw new InternalServerErrorException(
        'Gagal memproses peringatan darurat',
      );
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
    // Waktu backend mulai menyiapkan pesan.
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

    console.log('[SOS BACKEND] Preparing FCM:', {
      senderName,
      tokenCount: tokens.length,
      preparedAt,
    });

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
      console.error('[SOS BACKEND] Failed to send FCM:', error);
      throw error;
    }
  }
}
