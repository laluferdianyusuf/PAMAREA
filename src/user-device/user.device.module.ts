import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DeviceController } from './user.device.controller.js';
import { DeviceService } from './user.device.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}
