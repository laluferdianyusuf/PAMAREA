import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
@Injectable()
export class DeviceService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(
    userId: string,
    data: {
      deviceIdentifier: string; // FCM Token
      platform?: string; // 'android' atau 'ios'
      model?: string; // misal: 'Samsung Galaxy S23'
      osVersion?: string; // misal: '14'
      appVersion?: string; // misal: '1.0.0'
    },
  ) {
    // Gunakan UPSERT: Update jika token sudah ada, Create jika belum ada
    const device = await this.prisma.userDevice.upsert({
      where: {
        deviceIdentifier: data.deviceIdentifier, // Karena di schema diset @unique
      },
      update: {
        userId: userId, // Pastikan device ini di-link ke user yang sedang login
        platform: data.platform,
        model: data.model,
        osVersion: data.osVersion,
        appVersion: data.appVersion,
        status: 'ACTIVE',
        lastSeenAt: new Date(),
      },
      create: {
        userId: userId,
        deviceIdentifier: data.deviceIdentifier,
        platform: data.platform,
        model: data.model,
        osVersion: data.osVersion,
        appVersion: data.appVersion,
        status: 'ACTIVE',
        lastSeenAt: new Date(),
      },
    });

    return {
      status: 'SUCCESS',
      message: 'Device successfully registered',
      data: device,
    };
  }

  // Opsional: Endpoint untuk set device menjadi INACTIVE saat user Logout
  async removeDevice(deviceIdentifier: string) {
    await this.prisma.userDevice.update({
      where: { deviceIdentifier },
      data: { status: 'INACTIVE' },
    });
    return { status: 'SUCCESS' };
  }
}
