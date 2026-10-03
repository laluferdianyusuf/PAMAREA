import * as bcrypt from 'bcrypt';

import {
  AssignmentStatus,
  NfcAssignmentStatus,
  NfcStatus,
  PatrolPointStatus,
  PhotoRequirement,
  QuestionStatus,
  QuestionType,
  RoleName,
  SiteStatus,
  UserStatus,
} from '../src/generated/prisma/enums.js';
import { createPrismaClient } from '../src/prisma/prisma.client.js';

const prisma = createPrismaClient();

async function main() {
  console.log('Starting database seed...');

  const adminRole = await prisma.role.upsert({
    where: {
      name: RoleName.ADMIN,
    },
    update: {},
    create: {
      name: RoleName.ADMIN,
      description: 'Administrator sistem',
    },
  });

  const satpamRole = await prisma.role.upsert({
    where: {
      name: RoleName.SECURITY,
    },
    update: {},
    create: {
      name: RoleName.SECURITY,
      description: 'Petugas keamanan / satpam',
    },
  });

  console.log('Roles created');

  const site = await prisma.site.upsert({
    where: {
      code: 'SITE-001',
    },
    update: {},
    create: {
      code: 'SITE-001',
      name: 'Gedung Utama',
      address: 'Jl. Contoh No. 1, Bandung, Jawa Barat',

      // Contoh koordinat development.
      // Nanti diganti koordinat lokasi sebenarnya.
      latitude: -6.917464,
      longitude: 107.619123,

      status: SiteStatus.ACTIVE,
    },
  });

  console.log(`Site created: ${site.name}`);

  const adminPassword = await bcrypt.hash('Admin123!', 12);

  const admin = await prisma.user.upsert({
    where: {
      username: 'admin',
    },
    update: {
      fullName: 'Administrator',
      roleId: adminRole.id,
      siteId: site.id,
      status: UserStatus.ACTIVE,
    },
    create: {
      roleId: adminRole.id,
      siteId: site.id,

      employeeNumber: 'ADM001',
      fullName: 'Administrator',

      username: 'admin',
      email: 'admin@patrol.local',
      phone: '081234567890',

      passwordHash: adminPassword,

      status: UserStatus.ACTIVE,
    },
  });

  console.log(`Admin created: ${admin.username}`);

  const satpamPassword = await bcrypt.hash('Satpam123!', 12);

  const satpam1 = await prisma.user.upsert({
    where: {
      username: 'satpam001',
    },
    update: {
      fullName: 'Budi Santoso',
      roleId: satpamRole.id,
      siteId: site.id,
      status: UserStatus.ACTIVE,
    },
    create: {
      roleId: satpamRole.id,
      siteId: site.id,

      employeeNumber: 'SP001',
      fullName: 'Budi Santoso',

      username: 'satpam001',
      email: 'satpam001@patrol.local',
      phone: '081111111111',

      passwordHash: satpamPassword,

      status: UserStatus.ACTIVE,
    },
  });

  const satpam2 = await prisma.user.upsert({
    where: {
      username: 'satpam002',
    },
    update: {
      fullName: 'Andi Wijaya',
      roleId: satpamRole.id,
      siteId: site.id,
      status: UserStatus.ACTIVE,
    },
    create: {
      roleId: satpamRole.id,
      siteId: site.id,

      employeeNumber: 'SP002',
      fullName: 'Andi Wijaya',

      username: 'satpam002',
      email: 'satpam002@patrol.local',
      phone: '082222222222',

      passwordHash: satpamPassword,

      status: UserStatus.ACTIVE,
    },
  });

  console.log('Satpam created');

  const point1 = await prisma.patrolPoint.upsert({
    where: {
      siteId_code: {
        siteId: site.id,
        code: 'P001',
      },
    },
    update: {},
    create: {
      siteId: site.id,
      code: 'P001',
      name: 'Pintu Utama',
      description: 'Pintu masuk utama gedung',

      latitude: -6.917464,
      longitude: 107.619123,

      radiusMeters: 50,

      status: PatrolPointStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  const point2 = await prisma.patrolPoint.upsert({
    where: {
      siteId_code: {
        siteId: site.id,
        code: 'P002',
      },
    },
    update: {},
    create: {
      siteId: site.id,
      code: 'P002',
      name: 'Area Parkir',
      description: 'Area parkir kendaraan',

      latitude: -6.9177,
      longitude: 107.6193,

      radiusMeters: 50,

      status: PatrolPointStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  const point3 = await prisma.patrolPoint.upsert({
    where: {
      siteId_code: {
        siteId: site.id,
        code: 'P003',
      },
    },
    update: {},
    create: {
      siteId: site.id,
      code: 'P003',
      name: 'Lobby',
      description: 'Area lobby utama',

      latitude: -6.91755,
      longitude: 107.61895,

      radiusMeters: 40,

      status: PatrolPointStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  const point4 = await prisma.patrolPoint.upsert({
    where: {
      siteId_code: {
        siteId: site.id,
        code: 'P004',
      },
    },
    update: {},
    create: {
      siteId: site.id,
      code: 'P004',
      name: 'Lantai 2',
      description: 'Koridor lantai 2',

      latitude: -6.91735,
      longitude: 107.619,

      radiusMeters: 40,

      status: PatrolPointStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  const point5 = await prisma.patrolPoint.upsert({
    where: {
      siteId_code: {
        siteId: site.id,
        code: 'P005',
      },
    },
    update: {},
    create: {
      siteId: site.id,
      code: 'P005',
      name: 'Area Belakang',
      description: 'Area belakang gedung',

      latitude: -6.9178,
      longitude: 107.6188,

      radiusMeters: 50,

      status: PatrolPointStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  console.log('Patrol points created');

  const nfc1 = await prisma.nfcTag.upsert({
    where: {
      uid: '04A1B2C3D401',
    },
    update: {},
    create: {
      uid: '04A1B2C3D401',
      label: 'NFC Pintu Utama',
      status: NfcStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  const nfc2 = await prisma.nfcTag.upsert({
    where: {
      uid: '04A1B2C3D402',
    },
    update: {},
    create: {
      uid: '04A1B2C3D402',
      label: 'NFC Area Parkir',
      status: NfcStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  const nfc3 = await prisma.nfcTag.upsert({
    where: {
      uid: '04A1B2C3D403',
    },
    update: {},
    create: {
      uid: '04A1B2C3D403',
      label: 'NFC Lobby',
      status: NfcStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  const nfc4 = await prisma.nfcTag.upsert({
    where: {
      uid: '04A1B2C3D404',
    },
    update: {},
    create: {
      uid: '04A1B2C3D404',
      label: 'NFC Lantai 2',
      status: NfcStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  const nfc5 = await prisma.nfcTag.upsert({
    where: {
      uid: '04A1B2C3D405',
    },
    update: {},
    create: {
      uid: '04A1B2C3D405',
      label: 'NFC Area Belakang',
      status: NfcStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  console.log('NFC tags created');

  await prisma.patrolPointNfc.createMany({
    data: [
      {
        patrolPointId: point1.id,
        nfcTagId: nfc1.id,

        assignedAt: new Date(),
        status: NfcAssignmentStatus.ACTIVE,

        createdById: admin.id,
      },
      {
        patrolPointId: point2.id,
        nfcTagId: nfc2.id,

        assignedAt: new Date(),
        status: NfcAssignmentStatus.ACTIVE,

        createdById: admin.id,
      },
      {
        patrolPointId: point3.id,
        nfcTagId: nfc3.id,

        assignedAt: new Date(),
        status: NfcAssignmentStatus.ACTIVE,

        createdById: admin.id,
      },
      {
        patrolPointId: point4.id,
        nfcTagId: nfc4.id,

        assignedAt: new Date(),
        status: NfcAssignmentStatus.ACTIVE,

        createdById: admin.id,
      },
      {
        patrolPointId: point5.id,
        nfcTagId: nfc5.id,

        assignedAt: new Date(),
        status: NfcAssignmentStatus.ACTIVE,

        createdById: admin.id,
      },
    ],
    skipDuplicates: true,
  });

  console.log('NFC assignments created');

  const today = new Date();

  const startDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const endDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 30,
  );

  await prisma.patrolAssignment.createMany({
    data: [
      {
        userId: satpam1.id,
        patrolPointId: point1.id,

        startDate,
        endDate,

        status: AssignmentStatus.ACTIVE,
        createdById: admin.id,
      },
      {
        userId: satpam1.id,
        patrolPointId: point2.id,

        startDate,
        endDate,

        status: AssignmentStatus.ACTIVE,
        createdById: admin.id,
      },
      {
        userId: satpam1.id,
        patrolPointId: point3.id,

        startDate,
        endDate,

        status: AssignmentStatus.ACTIVE,
        createdById: admin.id,
      },

      {
        userId: satpam2.id,
        patrolPointId: point4.id,

        startDate,
        endDate,

        status: AssignmentStatus.ACTIVE,
        createdById: admin.id,
      },
      {
        userId: satpam2.id,
        patrolPointId: point5.id,

        startDate,
        endDate,

        status: AssignmentStatus.ACTIVE,
        createdById: admin.id,
      },
    ],
    skipDuplicates: true,
  });

  console.log('Patrol assignments created');

  const q1 = await prisma.question.create({
    data: {
      code: 'Q-DOOR-01',
      questionText: 'Apakah pintu utama dalam kondisi terkunci dengan baik?',
      questionType: QuestionType.YES_NO,

      isRequired: true,
      photoRequirement: PhotoRequirement.NONE,

      status: QuestionStatus.ACTIVE,

      createdById: admin.id,
    },
  });

  const q2 = await prisma.question.create({
    data: {
      code: 'Q-PARK-01',
      questionText: 'Apakah area parkir dalam kondisi aman?',
      questionType: QuestionType.YES_NO,

      isRequired: true,
      photoRequirement: PhotoRequirement.CONDITIONAL,

      status: QuestionStatus.ACTIVE,

      createdById: admin.id,
    },
  });

  const q3 = await prisma.question.create({
    data: {
      code: 'Q-LOBBY-01',
      questionText: 'Apakah kondisi lobby bersih dan aman?',
      questionType: QuestionType.YES_NO,

      isRequired: true,
      photoRequirement: PhotoRequirement.NONE,

      status: QuestionStatus.ACTIVE,

      createdById: admin.id,
    },
  });

  const q4 = await prisma.question.create({
    data: {
      code: 'Q-GUARD-01',
      questionText: 'Apakah terdapat aktivitas mencurigakan?',
      questionType: QuestionType.YES_NO,

      isRequired: true,
      photoRequirement: PhotoRequirement.CONDITIONAL,

      status: QuestionStatus.ACTIVE,

      createdById: admin.id,
    },
  });

  const q5 = await prisma.question.create({
    data: {
      code: 'Q-NOTE-01',
      questionText: 'Catatan tambahan kondisi lokasi',
      questionType: QuestionType.TEXT,

      isRequired: false,
      photoRequirement: PhotoRequirement.NONE,

      status: QuestionStatus.ACTIVE,

      createdById: admin.id,
    },
  });

  console.log('Questions created');

  await prisma.questionOption.createMany({
    data: [
      {
        questionId: q1.id,
        value: 'YES',
        label: 'Ya',
        sortOrder: 1,
      },
      {
        questionId: q1.id,
        value: 'NO',
        label: 'Tidak',
        sortOrder: 2,
      },

      {
        questionId: q2.id,
        value: 'YES',
        label: 'Ya',
        sortOrder: 1,
      },
      {
        questionId: q2.id,
        value: 'NO',
        label: 'Tidak',
        sortOrder: 2,
      },

      {
        questionId: q3.id,
        value: 'YES',
        label: 'Ya',
        sortOrder: 1,
      },
      {
        questionId: q3.id,
        value: 'NO',
        label: 'Tidak',
        sortOrder: 2,
      },

      {
        questionId: q4.id,
        value: 'YES',
        label: 'Ya',
        sortOrder: 1,
      },
      {
        questionId: q4.id,
        value: 'NO',
        label: 'Tidak',
        sortOrder: 2,
      },
    ],
    skipDuplicates: true,
  });

  console.log('Question options created');

  await prisma.pointQuestion.createMany({
    data: [
      // Pintu Utama
      {
        patrolPointId: point1.id,
        questionId: q1.id,
        sortOrder: 1,
        isRequired: true,
        createdById: admin.id,
      },
      {
        patrolPointId: point1.id,
        questionId: q4.id,
        sortOrder: 2,
        isRequired: true,
        createdById: admin.id,
      },
      {
        patrolPointId: point1.id,
        questionId: q5.id,
        sortOrder: 3,
        isRequired: false,
        createdById: admin.id,
      },

      // Area Parkir
      {
        patrolPointId: point2.id,
        questionId: q2.id,
        sortOrder: 1,
        isRequired: true,
        createdById: admin.id,
      },
      {
        patrolPointId: point2.id,
        questionId: q4.id,
        sortOrder: 2,
        isRequired: true,
        createdById: admin.id,
      },

      // Lobby
      {
        patrolPointId: point3.id,
        questionId: q3.id,
        sortOrder: 1,
        isRequired: true,
        createdById: admin.id,
      },
      {
        patrolPointId: point3.id,
        questionId: q4.id,
        sortOrder: 2,
        isRequired: true,
        createdById: admin.id,
      },

      // Lantai 2
      {
        patrolPointId: point4.id,
        questionId: q4.id,
        sortOrder: 1,
        isRequired: true,
        createdById: admin.id,
      },
      {
        patrolPointId: point4.id,
        questionId: q5.id,
        sortOrder: 2,
        isRequired: false,
        createdById: admin.id,
      },

      // Area Belakang
      {
        patrolPointId: point5.id,
        questionId: q4.id,
        sortOrder: 1,
        isRequired: true,
        createdById: admin.id,
      },
      {
        patrolPointId: point5.id,
        questionId: q5.id,
        sortOrder: 2,
        isRequired: false,
        createdById: admin.id,
      },
    ],
    skipDuplicates: true,
  });

  console.log('Point questions created');

  console.log('');
  console.log('========================================');
  console.log('DATABASE SEED COMPLETED');
  console.log('========================================');
  console.log('');
  console.log('LOGIN ACCOUNTS');
  console.log('');
  console.log('ADMIN');
  console.log('Username : admin');
  console.log('Password : Admin123!');
  console.log('');
  console.log('SATPAM 1');
  console.log('Username : satpam001');
  console.log('Password : Satpam123!');
  console.log('');
  console.log('SATPAM 2');
  console.log('Username : satpam002');
  console.log('Password : Satpam123!');
  console.log('');
  console.log('========================================');
}

main()
  .catch((error) => {
    console.error('Seed failed');
    console.error(error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
