import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

import * as bcrypt from 'bcrypt';
import { UploadedFile } from '../common/types/uploaded-file.type.js';
import { Prisma } from '../generated/prisma/client.js';
import { UserStatus } from '../generated/prisma/enums.js';
import { StorageService } from '../storage/storage.service.js';
import { CreateUserDto } from './dto/create-users.dto.js';
import { UpdateUserDto } from './dto/update-users.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async findAllUsers() {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        role: true,
        site: true,
        scheduleAssignments: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Data user berhasil ditemukan',
      data: users,
    };
  }

  async findAllActiveUsers() {
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        role: true,
        site: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    return {
      message: 'Data user aktif berhasil ditemukan',
      data: users,
    };
  }

  async findUserById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        role: true,
        site: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    return {
      message: 'User berhasil ditemukan',
      data: user,
    };
  }

  async findAllSecurityUsers() {
    const users = await this.prisma.user.findMany({
      where: {
        role: {
          name: 'SECURITY',
        },
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        role: true,
        site: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    return {
      message: 'Data satpam aktif berhasil ditemukan',
      data: users.map((user) => this.sanitizeUser(user)),
    };
  }

  async createUser(dto: CreateUserDto, createdById: string) {
    if (dto.teamId && dto.team) {
      throw new BadRequestException(
        'Pilih teamId atau team untuk membuat regu baru, bukan keduanya.',
      );
    }

    const username = dto.username.trim();
    const email = dto.email?.trim().toLowerCase() || undefined;
    const employeeNumber = dto.employeeNumber?.trim() || undefined;

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username },
          ...(email ? [{ email }] : []),
          ...(employeeNumber ? [{ employeeNumber }] : []),
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
        employeeNumber: true,
      },
    });

    if (existingUser) {
      if (existingUser.username === username) {
        throw new ConflictException('Username sudah digunakan.');
      }

      if (email && existingUser.email === email) {
        throw new ConflictException('Email sudah digunakan.');
      }

      if (employeeNumber && existingUser.employeeNumber === employeeNumber) {
        throw new ConflictException('Nomor karyawan sudah digunakan.');
      }
    }

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });

    if (!role) {
      throw new NotFoundException('Role tidak ditemukan.');
    }

    if (role.name === 'SECURITY' && !dto.siteId) {
      throw new BadRequestException('Site wajib diisi untuk user SECURITY.');
    }

    if ((dto.teamId || dto.team) && role.name !== 'SECURITY') {
      throw new BadRequestException(
        'Regu hanya dapat diberikan kepada user SECURITY.',
      );
    }

    if (role.name === 'SECURITY' && !dto.teamId && !dto.team) {
      throw new BadRequestException(
        'Pilih regu yang sudah ada atau isi data regu baru.',
      );
    }

    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({
        where: {
          id: dto.siteId,
          status: 'ACTIVE',
        },
      });

      if (!site) {
        throw new NotFoundException('Site tidak ditemukan atau tidak aktif.');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      return await this.prisma.$transaction(async (tx) => {
        let teamId: string | null = null;

        if (dto.team) {
          const name = dto.team.name.trim();
          const code = dto.team.code.trim().toUpperCase();

          const team = await tx.team.create({
            data: {
              siteId: dto.siteId!,
              name,
              code,
              description: dto.team.description?.trim() || null,
              status: 'ACTIVE',
            },
          });

          teamId = team.id;
        }

        if (dto.teamId) {
          const team = await tx.team.findFirst({
            where: {
              id: dto.teamId,
              siteId: dto.siteId!,
              status: 'ACTIVE',
            },
          });

          if (!team) {
            throw new BadRequestException(
              'Regu tidak ditemukan, tidak aktif, atau bukan milik site yang dipilih.',
            );
          }

          teamId = team.id;
        }

        const user = await tx.user.create({
          data: {
            roleId: dto.roleId,
            siteId: dto.siteId ?? null,
            createdById,
            employeeNumber: employeeNumber ?? null,
            fullName: dto.fullName.trim(),
            username,
            email: email ?? null,
            phone: dto.phone ?? null,
            passwordHash,
            photoUrl: dto.photoUrl ?? null,
            status: 'ACTIVE',
            teamId,
          },
          include: {
            role: true,
            site: true,
            team: true,
          },
        });

        return this.sanitizeUser(user);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Username, email, nomor karyawan, atau kode/nama regu sudah digunakan.',
        );
      }

      throw error;
    }
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    if (dto.teamId && dto.team) {
      throw new BadRequestException('Pilih teamId atau team, bukan keduanya.');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        site: true,
        team: true,
      },
    });

    if (!existingUser) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    const nextRoleId = dto.roleId ?? existingUser.roleId;
    const nextSiteId =
      dto.siteId !== undefined ? dto.siteId : existingUser.siteId;

    const nextRole =
      nextRoleId === existingUser.roleId
        ? existingUser.role
        : await this.prisma.role.findUnique({
            where: { id: nextRoleId },
          });

    if (!nextRole) {
      throw new NotFoundException('Role tidak ditemukan.');
    }

    if (nextRole.name === 'SECURITY' && !nextSiteId) {
      throw new BadRequestException('Site wajib diisi untuk user SECURITY.');
    }

    if ((dto.teamId || dto.team) && nextRole.name !== 'SECURITY') {
      throw new BadRequestException(
        'Regu hanya dapat diberikan kepada user SECURITY.',
      );
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : undefined;

    try {
      return await this.prisma.$transaction(async (tx) => {
        let teamId: string | null = existingUser.teamId ?? null;

        if (nextRole.name !== 'SECURITY') {
          teamId = null;
        } else if (dto.team) {
          const team = await tx.team.create({
            data: {
              siteId: nextSiteId!,
              name: dto.team.name.trim(),
              code: dto.team.code.trim().toUpperCase(),
              description: dto.team.description?.trim() || null,
              status: 'ACTIVE',
            },
          });

          teamId = team.id;
        } else if (dto.teamId) {
          const team = await tx.team.findFirst({
            where: {
              id: dto.teamId,
              siteId: nextSiteId!,
              status: 'ACTIVE',
            },
          });

          if (!team) {
            throw new BadRequestException(
              'Regu tidak ditemukan, tidak aktif, atau bukan milik site yang dipilih.',
            );
          }

          teamId = team.id;
        } else if (nextSiteId !== existingUser.siteId) {
          // Jika site berubah, regu lama tidak boleh ikut terbawa.
          teamId = null;
        }

        if (nextRole.name === 'SECURITY' && !teamId) {
          throw new BadRequestException(
            'User SECURITY wajib memiliki regu aktif.',
          );
        }

        const updatedUser = await tx.user.update({
          where: { id },
          data: {
            ...(dto.roleId !== undefined && {
              roleId: dto.roleId,
            }),
            ...(dto.siteId !== undefined && {
              siteId: dto.siteId,
            }),
            ...(dto.employeeNumber !== undefined && {
              employeeNumber: dto.employeeNumber?.trim() || null,
            }),
            ...(dto.fullName !== undefined && {
              fullName: dto.fullName.trim(),
            }),
            ...(dto.username !== undefined && {
              username: dto.username.trim(),
            }),
            ...(dto.email !== undefined && {
              email: dto.email?.trim().toLowerCase() || null,
            }),
            ...(dto.phone !== undefined && {
              phone: dto.phone,
            }),
            ...(dto.photoUrl !== undefined && {
              photoUrl: dto.photoUrl,
            }),
            ...(passwordHash && {
              passwordHash,
            }),
            teamId,
          },
          include: {
            role: true,
            site: true,
            team: true,
          },
        });

        return this.sanitizeUser(updatedUser);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Data user atau nama/kode regu sudah digunakan.',
        );
      }

      throw error;
    }
  }

  async changeUserPhoto(id: string, file: UploadedFile) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    const savedPhoto = await this.storageService.saveUserPhoto(file);

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: {
          photoUrl: savedPhoto.url,
        },
        include: {
          role: true,
          site: true,
        },
      });

      return {
        message: 'Foto user berhasil diperbarui',
        data: this.sanitizeUser(updatedUser),
      };
    } catch {
      throw new InternalServerErrorException('Gagal memperbarui foto user');
    }
  }

  async deactivateUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new ConflictException('User sudah tidak aktif');
    }

    try {
      const updated = await this.prisma.user.update({
        where: {
          id,
        },
        data: {
          status: UserStatus.INACTIVE,
          deletedAt: new Date(),
        },
      });

      return {
        message: 'User berhasil dinonaktifkan',
        data: this.sanitizeUser(updated),
      };
    } catch (error) {
      throw new InternalServerErrorException('Gagal menonaktifkan user');
    }
  }

  async activateUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (user.status === UserStatus.ACTIVE) {
      throw new ConflictException('User sudah aktif');
    }

    try {
      const updated = await this.prisma.user.update({
        where: {
          id,
        },
        data: {
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      });

      return {
        message: 'User berhasil diaktifkan',
        data: this.sanitizeUser(updated),
      };
    } catch (error) {
      throw new InternalServerErrorException('Gagal mengaktifkan user');
    }
  }

  async removeUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    try {
      await this.prisma.user.delete({
        where: {
          id,
        },
      });

      return {
        message: 'User berhasil dihapus permanen',
      };
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'User tidak dapat dihapus karena masih memiliki data terkait',
        );
      }

      throw new InternalServerErrorException('Gagal menghapus user');
    }
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...safeUser } = user;

    return safeUser;
  }
}
