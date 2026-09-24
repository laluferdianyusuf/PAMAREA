import { Module } from '@nestjs/common';
import { PatrolsController } from './patrols.controller.js';
import { PatrolsService } from './patrols.service.js';
import { GpsValidationService } from './services/gps-validation.service.js';
import { NfcValidationService } from './services/nfc-validation.service.js';

@Module({
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
