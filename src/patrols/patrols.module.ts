import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit.module.js';
import { EmergencyService } from '../emergency/emergency.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { PatrolExportService } from './patrol-export.service.js';
import { PatrolsController } from './patrols.controller.js';
import { PatrolsService } from './patrols.service.js';
import { GpsValidationService } from './services/gps-validation.service.js';
import { NfcValidationService } from './services/nfc-validation.service.js';

@Module({
  imports: [StorageModule, AuditLogModule],
  controllers: [PatrolsController],
  providers: [
    PatrolsService,
    GpsValidationService,
    NfcValidationService,
    EmergencyService,
    PatrolExportService,
    // PatrolValidationService,
  ],
  exports: [
    PatrolsService,
    GpsValidationService,
    NfcValidationService,
    PatrolExportService,
  ],
})
export class PatrolsModule {}
