import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { PatrolsController } from './patrols.controller.js';
import { PatrolsService } from './patrols.service.js';
import { GpsValidationService } from './services/gps-validation.service.js';
import { NfcValidationService } from './services/nfc-validation.service.js';

@Module({
  imports: [StorageModule],
  controllers: [PatrolsController],
  providers: [
    PatrolsService,
    GpsValidationService,
    NfcValidationService,
    // PatrolValidationService,
  ],
  exports: [PatrolsService, GpsValidationService, NfcValidationService],
})
export class PatrolsModule {}
