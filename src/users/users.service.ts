import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client.js';
import { UserStatus } from '../generated/prisma/enums.js';
import { CreateUserDto } from './dto/create-users.dto.js';
import { UpdateUserDto } from './dto/update-users.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllUsers() {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        role: true,
        site: true,
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

  async createUser(dto: CreateUserDto, createdById?: string) {
    try {
      const existingUsername = await this.prisma.user.findUnique({
        where: {
          username: dto.username,
        },
      });

      if (existingUsername) {
        throw new ConflictException(
          `Username "${dto.username}" sudah digunakan`,
        );
      }

      if (dto.email) {
        const existingEmail = await this.prisma.user.findUnique({
          where: {
            email: dto.email,
          },
        });

        if (existingEmail) {
          throw new ConflictException(`Email "${dto.email}" sudah digunakan`);
        }
      }

      if (dto.employeeNumber) {
        const existingEmployee = await this.prisma.user.findUnique({
          where: {
            employeeNumber: dto.employeeNumber,
          },
        });

        if (existingEmployee) {
          throw new ConflictException(
            `Employee number "${dto.employeeNumber}" sudah digunakan`,
          );
        }
      }

      const role = await this.prisma.role.findUnique({
        where: {
          id: dto.roleId,
        },
      });

      if (!role) {
        throw new NotFoundException('Role tidak ditemukan');
      }

      if (dto.siteId) {
        const site = await this.prisma.site.findUnique({
          where: {
            id: dto.siteId,
          },
        });

        if (!site) {
          throw new NotFoundException('Site tidak ditemukan');
        }

        if (site.status !== 'ACTIVE') {
          throw new ConflictException('Site yang dipilih tidak aktif');
        }
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);

      const user = await this.prisma.user.create({
        data: {
          roleId: dto.roleId,
          siteId: dto.siteId,
          createdById,
          employeeNumber: dto.employeeNumber,
          fullName: dto.fullName,
          username: dto.username,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
        include: {
          role: true,
          site: true,
        },
      });

      return {
        message: 'User berhasil ditambahkan',
        data: this.sanitizeUser(user),
      };
    } catch (error: any) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Username, email, atau employee number sudah digunakan',
        );
      }

      throw new InternalServerErrorException('Gagal menambahkan user');
    }
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existingUser) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (dto.username && dto.username !== existingUser.username) {
      const usernameExists = await this.prisma.user.findUnique({
        where: {
          username: dto.username,
        },
      });

      if (usernameExists) {
        throw new ConflictException(
          `Username "${dto.username}" sudah digunakan`,
        );
      }
    }

    if (dto.email && dto.email !== existingUser.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: {
          email: dto.email,
        },
      });

      if (emailExists) {
        throw new ConflictException(`Email "${dto.email}" sudah digunakan`);
      }
    }

    if (
      dto.employeeNumber &&
      dto.employeeNumber !== existingUser.employeeNumber
    ) {
      const employeeExists = await this.prisma.user.findUnique({
        where: {
          employeeNumber: dto.employeeNumber,
        },
      });

      if (employeeExists) {
        throw new ConflictException(
          `Employee number "${dto.employeeNumber}" sudah digunakan`,
        );
      }
    }

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: {
          id: dto.roleId,
        },
      });

      if (!role) {
        throw new NotFoundException('Role tidak ditemukan');
      }
    }

    if (dto.siteId) {
      const site = await this.prisma.site.findUnique({
        where: {
          id: dto.siteId,
        },
      });

      if (!site) {
        throw new NotFoundException('Site tidak ditemukan');
      }

      if (site.status !== 'ACTIVE') {
        throw new ConflictException('Site yang dipilih tidak aktif');
      }
    }

    try {
      const updateData: Prisma.UserUpdateInput = {
        ...(dto.roleId && {
          role: {
            connect: {
              id: dto.roleId,
            },
          },
        }),

        ...(dto.siteId !== undefined && {
          site: dto.siteId
            ? {
                connect: {
                  id: dto.siteId,
                },
              }
            : {
                disconnect: true,
              },
        }),

        ...(dto.employeeNumber !== undefined && {
          employeeNumber: dto.employeeNumber,
        }),

        ...(dto.fullName !== undefined && {
          fullName: dto.fullName,
        }),

        ...(dto.username !== undefined && {
          username: dto.username,
        }),

        ...(dto.email !== undefined && {
          email: dto.email,
        }),

        ...(dto.phone !== undefined && {
          phone: dto.phone,
        }),
      };

      if (dto.password) {
        updateData.passwordHash = await bcrypt.hash(dto.password, 12);
      }

      const updated = await this.prisma.user.update({
        where: {
          id,
        },
        data: updateData,
        include: {
          role: true,
          site: true,
        },
      });

      return {
        message: 'User berhasil diperbarui',
        data: this.sanitizeUser(updated),
      };
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Username, email, atau employee number sudah digunakan',
        );
      }

      throw new InternalServerErrorException('Gagal memperbarui user');
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
