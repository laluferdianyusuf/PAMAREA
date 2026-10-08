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
          id: { not: senderId },
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

  /**
   * Helper function untuk mengirim FCM Notification beserta Lokasi
   */
  private async sendFcmEmergencyAlert(
    tokens: string[],
    senderName: string,
    locationData: { latitude?: number; longitude?: number; note?: string },
  ) {
    // 1. Siapkan custom payload data
    // Aturan FCM: Semua value di dalam 'data' HARUS berformat string.
    const customPayloadData: Record<string, string> = {
      type: 'EMERGENCY_ALERT',
      click_action: 'FLUTTER_NOTIFICATION_CLICK', // Sesuaikan jika pakai React Native
      senderName: senderName,
      timestamp: new Date().toISOString(),
    };

    // 2. Masukkan koordinat jika dikirim dari mobile
    if (locationData.latitude && locationData.longitude) {
      customPayloadData.latitude = locationData.latitude.toString();
      customPayloadData.longitude = locationData.longitude.toString();
    }

    if (locationData.note) {
      customPayloadData.note = locationData.note;
    }

    const payload: MulticastMessage = {
      tokens: tokens,
      notification: {
        title: '🚨 DARURAT 🚨',
        body: `${senderName} menekan tombol darurat! Segera merapat untuk memberikan bantuan.`,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'emergency_channel',
          sound: 'emergency_siren',
          defaultSound: false,
          defaultVibrateTimings: false,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'emergency_siren.wav',
            badge: 1,
            'interruption-level': 'critical',
          },
        },
      },
      // 3. Sisipkan custom payload ke dalam property data
      data: customPayloadData,
    };

    try {
      const response = await getMessaging().sendEachForMulticast(payload);
      console.log(
        `FCM Sent -> Sukses: ${response.successCount}, Gagal: ${response.failureCount}`,
      );
    } catch (error) {
      console.error('Failed to send FCM payload:', error);
    }
  }
}
