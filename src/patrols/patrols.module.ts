import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit.module.js';
import { EmergencyService } from '../emergency/emergency.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { PatrolWarningService } from './patrol-answer.service.js';
import { PatrolHistoryExportService } from './patrol-history-export.service.js';
import { PatrolWarningController } from './patrol-warning.controller.js';
import { PatrolsController } from './patrols.controller.js';
import { PatrolsService } from './patrols.service.js';
import { GpsValidationService } from './services/gps-validation.service.js';
import { NfcValidationService } from './services/nfc-validation.service.js';

@Module({
  imports: [StorageModule, AuditLogModule],
  controllers: [PatrolsController, PatrolWarningController],
  providers: [
    PatrolsService,
    GpsValidationService,
    NfcValidationService,
    EmergencyService,
    PatrolHistoryExportService,
    PatrolWarningService,
    // PatrolValidationService,
  ],
  exports: [
    PatrolsService,
    GpsValidationService,
    NfcValidationService,
    PatrolHistoryExportService,
  ],
})
export class PatrolsModule {}
