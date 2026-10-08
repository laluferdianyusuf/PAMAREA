import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PatrolAssignmentModule } from './assignments/assignments.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { EmergencyModule } from './emergency/emergency.module.js';
import { FindingsModule } from './findings/findings.module.js';
import { NfcModule } from './nfc/nfc.module.js';
import { PatrolPointNfcModule } from './patrol-point-nfc/patrol-point-nfc.module.js';
import { PatrolPointsModule } from './patrol-points/patrol-points.module.js';
import { PatrolsModule } from './patrols/patrols.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QuestionsModule } from './questions/questions.module.js';
import { RolesModule } from './roles/roles.module.js';
import { PatrolScheduleModule } from './schedule/patrol.schedule.module.js';
import { SitesModule } from './sites/sites.module.js';
import { StorageModule } from './storage/storage.module.js';
import { DeviceModule } from './user-device/user.device.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,

    UsersModule,

    SitesModule,

    PatrolPointsModule,

    NfcModule,

    PatrolPointNfcModule,

    PatrolAssignmentModule,

    FindingsModule,

    RolesModule,

    PatrolScheduleModule,

    DashboardModule,

    StorageModule,

    QuestionsModule,

    PatrolsModule,

    EmergencyModule,

    DeviceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
