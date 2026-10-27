import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import {
  PrismaClient,
  RoleName,
  SiteStatus,
  UserStatus,
} from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Memulai seeder PAMAREA...');

  // 1. Buat seluruh role
  const roleDefinitions = [
    { name: RoleName.ADMIN, description: 'Administrator sistem' },
    { name: RoleName.SECURITY, description: 'Petugas keamanan' },
    { name: RoleName.DANRU_SECURITY, description: 'Komandan regu keamanan' },
    { name: RoleName.CHIEF_SECURITY, description: 'Kepala keamanan' },
  ];

  const roles = new Map<RoleName, string>();

  for (const definition of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { name: definition.name },
      update: { description: definition.description },
      create: definition,
    });

    roles.set(role.name, role.id);
    console.log(`Role siap: ${role.name}`);
  }

  // 2. Buat satu site default
  const site = await prisma.site.upsert({
    where: { code: 'SITE-001' },
    update: {
      name: 'UP Sambelia',
      status: SiteStatus.ACTIVE,
    },
    create: {
      code: 'SITE-001',
      name: 'UP Sambelia',
      address: 'Alamat site dapat diperbarui melalui admin',
      status: SiteStatus.ACTIVE,
    },
  });

  console.log(`Site siap: ${site.name} (${site.id})`);

  // 3. Buat satu akun admin
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password || password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD wajib diisi dan minimal 8 karakter.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const adminRoleId = roles.get(RoleName.ADMIN);

  if (!adminRoleId) {
    throw new Error('Role ADMIN tidak ditemukan.');
  }

  const admin = await prisma.user.upsert({
    where: { username },
    update: {
      roleId: adminRoleId,
      siteId: site.id,
      fullName: 'Administrator PAMAREA',
      passwordHash,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    create: {
      roleId: adminRoleId,
      siteId: site.id,
      fullName: 'Administrator PAMAREA',
      username,
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });

  console.log(`Admin siap: ${admin.username}`);
  console.log('Seeder PAMAREA berhasil.');
}

main()
  .catch((error) => {
    console.error('Seeder gagal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
