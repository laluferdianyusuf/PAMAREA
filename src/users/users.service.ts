import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuditLogService } from '../audit/audit.service.js';
import { UploadedFile } from '../common/types/uploaded-file.type.js';
import { Prisma } from '../generated/prisma/client.js';
import { UserStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CreateUserDto } from './dto/create-users.dto.js';
import { UpdateUserDto } from './dto/update-users.dto.js';

const userListSelect = {
  id: true,
  roleId: true,
  siteId: true,
  teamId: true,
  employeeNumber: true,
  fullName: true,
  username: true,
  email: true,
  phone: true,
  photoUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      id: true,
      name: true,
    },
  },
  site: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
} satisfies Prisma.UserSelect;

const userDetailSelect = {
  id: true,
  roleId: true,
  siteId: true,
  teamId: true,
  createdById: true,
  employeeNumber: true,
  fullName: true,
  username: true,
  email: true,
  phone: true,
  photoUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      id: true,
      name: true,
      description: true,
    },
  },
  site: {
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      status: true,
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAllUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        ...userListSelect,
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
      select: userListSelect,
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
      select: userDetailSelect,
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
      select: userListSelect,
      orderBy: {
        fullName: 'asc',
      },
    });

    return {
      message: 'Data satpam aktif berhasil ditemukan',
      data: users,
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
      where: {
        id: dto.roleId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!role) {
      throw new NotFoundException('Role tidak ditemukan.');
    }

    if (!dto.siteId) {
      throw new BadRequestException('Site wajib diisi');
    }

    if (!dto.teamId && !dto.team && dto.teamId !== undefined) {
      throw new BadRequestException('Regu harus dipilih');
    }

    if (!dto.teamId) {
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
        select: {
          id: true,
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

        let createdTeam:
          | {
              id: string;
              name: string;
              code: string;
            }
          | undefined;

        if (dto.team) {
          const team = await tx.team.create({
            data: {
              siteId: dto.siteId!,
              name: dto.team.name.trim(),
              code: dto.team.code.trim().toUpperCase(),
              description: dto.team.description?.trim() || null,
              status: 'ACTIVE',
            },
            select: {
              id: true,
              name: true,
              code: true,
            },
          });

          teamId = team.id;
          createdTeam = team;
        }

        if (dto.teamId) {
          const team = await tx.team.findFirst({
            where: {
              id: dto.teamId,
              siteId: dto.siteId!,
              status: 'ACTIVE',
            },
            select: {
              id: true,
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
            status: UserStatus.ACTIVE,
            teamId,
          },
          select: {
            ...userDetailSelect,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId: createdById,
          action: 'CREATE_USER',
          entityType: 'USER',
          entityId: user.id,
          newData: {
            id: user.id,
            fullName: user.fullName,
            username: user.username,
            email: user.email,
            employeeNumber: user.employeeNumber,
            roleId: user.roleId,
            roleName: user.role.name,
            siteId: user.siteId,
            teamId: user.teamId,
            status: user.status,
            ...(createdTeam ? { createdTeam } : {}),
          },
        });

        return user;
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

  async updateUser(id: string, dto: UpdateUserDto, actorId: string) {
    if (dto.teamId && dto.team) {
      throw new BadRequestException('Pilih teamId atau team, bukan keduanya.');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        roleId: true,
        siteId: true,
        teamId: true,
        fullName: true,
        username: true,
        email: true,
        employeeNumber: true,
        phone: true,
        photoUrl: true,
        status: true,
        deletedAt: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
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
            where: {
              id: nextRoleId,
            },
            select: {
              id: true,
              name: true,
            },
          });

    if (!nextRole) {
      throw new NotFoundException('Role tidak ditemukan.');
    }

    if (!nextSiteId) {
      throw new BadRequestException('Site wajib dipilih.');
    }

    if (!dto.teamId && !dto.team && dto.teamId !== undefined) {
      throw new BadRequestException('Regu wajib dipilih.');
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : undefined;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const site = await tx.site.findFirst({
          where: {
            id: nextSiteId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
          },
        });

        if (!site) {
          throw new NotFoundException('Site tidak ditemukan atau tidak aktif.');
        }

        let teamId: string | null = existingUser.teamId ?? null;

        if (dto.team) {
          const team = await tx.team.create({
            data: {
              siteId: nextSiteId,
              name: dto.team.name.trim(),
              code: dto.team.code.trim().toUpperCase(),
              description: dto.team.description?.trim() || null,
              status: 'ACTIVE',
            },
            select: {
              id: true,
            },
          });

          teamId = team.id;
        } else if (dto.teamId !== undefined) {
          if (!dto.teamId) {
            throw new BadRequestException('Regu wajib dipilih.');
          }

          const team = await tx.team.findFirst({
            where: {
              id: dto.teamId,
              siteId: nextSiteId,
              status: 'ACTIVE',
            },
            select: {
              id: true,
            },
          });

          if (!team) {
            throw new BadRequestException(
              'Regu tidak ditemukan, tidak aktif, atau bukan milik site yang dipilih.',
            );
          }

          teamId = team.id;
        } else if (teamId) {
          const existingTeam = await tx.team.findFirst({
            where: {
              id: teamId,
              siteId: nextSiteId,
              status: 'ACTIVE',
            },
            select: {
              id: true,
            },
          });

          if (!existingTeam) {
            throw new BadRequestException(
              'Regu lama tidak sesuai dengan site baru. Silakan pilih regu yang valid.',
            );
          }

          teamId = existingTeam.id;
        }

        if (!teamId) {
          throw new BadRequestException('User wajib memiliki regu aktif.');
        }

        const updatedUser = await tx.user.update({
          where: {
            id,
          },
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
          select: {
            ...userDetailSelect,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'UPDATE_USER',
          entityType: 'USER',
          entityId: updatedUser.id,

          oldData: {
            fullName: existingUser.fullName,
            username: existingUser.username,
            email: existingUser.email,
            employeeNumber: existingUser.employeeNumber,
            phone: existingUser.phone,
            photoUrl: existingUser.photoUrl,
            roleId: existingUser.roleId,
            siteId: existingUser.siteId,
            teamId: existingUser.teamId,
            status: existingUser.status,
          },

          newData: {
            fullName: updatedUser.fullName,
            username: updatedUser.username,
            email: updatedUser.email,
            employeeNumber: updatedUser.employeeNumber,
            phone: updatedUser.phone,
            photoUrl: updatedUser.photoUrl,
            roleId: updatedUser.roleId,
            siteId: updatedUser.siteId,
            teamId: updatedUser.teamId,
            status: updatedUser.status,
            passwordChanged: Boolean(passwordHash),
          },
        });

        return updatedUser;
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

  async changeUserPhoto(id: string, file: UploadedFile, actorId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        photoUrl: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    const savedPhoto = await this.storageService.saveUserPhoto(file);

    try {
      const updatedUser = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: {
            id,
          },
          data: {
            photoUrl: savedPhoto.url,
          },
          select: userDetailSelect,
        });

        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'CHANGE_USER_PHOTO',
          entityType: 'USER',
          entityId: id,
          oldData: {
            photoUrl: user.photoUrl,
          },
          newData: {
            photoUrl: updated.photoUrl,
          },
        });

        return updated;
      });

      return {
        message: 'Foto user berhasil diperbarui',
        data: updatedUser,
      };
    } catch {
      throw new InternalServerErrorException('Gagal memperbarui foto user');
    }
  }

  async deactivateUser(id: string, actorId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new ConflictException('User sudah tidak aktif');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: {
            id,
          },
          data: {
            status: UserStatus.INACTIVE,
            deletedAt: new Date(),
          },
          select: userDetailSelect,
        });

        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'DEACTIVATE_USER',
          entityType: 'USER',
          entityId: id,
          oldData: {
            status: user.status,
            deletedAt: user.deletedAt?.toISOString() ?? null,
          },
          newData: {
            status: updated.status,
          },
        });

        return {
          message: 'User berhasil dinonaktifkan',
          data: updated,
        };
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      throw new InternalServerErrorException('Gagal menonaktifkan user');
    }
  }

  async activateUser(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (user.status === UserStatus.ACTIVE && user.deletedAt === null) {
      throw new ConflictException('User sudah aktif');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: {
            id,
          },
          data: {
            status: UserStatus.ACTIVE,
            deletedAt: null,
          },
          select: userDetailSelect,
        });

        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'ACTIVATE_USER',
          entityType: 'USER',
          entityId: id,
          oldData: {
            status: user.status,
            deletedAt: user.deletedAt?.toISOString() ?? null,
          },
          newData: {
            status: updated.status,
          },
        });

        return {
          message: 'User berhasil diaktifkan',
          data: updated,
        };
      });
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Gagal mengaktifkan user');
    }
  }

  async removeUser(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        employeeNumber: true,
        roleId: true,
        siteId: true,
        teamId: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.auditLogService.createAudit(tx, {
          userId: actorId,
          action: 'DELETE_USER',
          entityType: 'USER',
          entityId: id,
          oldData: {
            id: user.id,
            fullName: user.fullName,
            username: user.username,
            email: user.email,
            employeeNumber: user.employeeNumber,
            roleId: user.roleId,
            siteId: user.siteId,
            teamId: user.teamId,
            status: user.status,
            deletedAt: user.deletedAt?.toISOString() ?? null,
          },
          newData: {
            deleted: true,
          },
        });

        await tx.user.delete({
          where: {
            id,
          },
        });
      });

      return {
        message: 'User berhasil dihapus permanen',
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'User tidak dapat dihapus karena masih memiliki data terkait',
        );
      }

      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Gagal menghapus user');
    }
  }
}
