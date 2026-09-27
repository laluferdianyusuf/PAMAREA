import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async createRole(dto: CreateRoleDto) {
    try {
      const existing = await this.prisma.role.findUnique({
        where: {
          name: dto.name,
        },
      });

      if (existing) {
        throw new ConflictException(`Role "${dto.name}" sudah ada`);
      }

      const role = await this.prisma.role.create({
        data: {
          name: dto.name,
          description: dto.description,
        },
      });

      return {
        message: 'Role berhasil ditambahkan',
        data: role,
      };
    } catch (error: any) {
      if (error instanceof ConflictException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Role "${dto.name}" sudah ada`);
      }

      throw new InternalServerErrorException('Gagal menambahkan role');
    }
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        _count: {
          select: {
            users: true,
          },
        },
      },
    });

    return {
      data: roles,
    };
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            users: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role tidak ditemukan');
    }

    return {
      data: role,
    };
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    try {
      const existing = await this.prisma.role.findUnique({
        where: {
          id,
        },
      });

      if (!existing) {
        throw new NotFoundException('Role tidak ditemukan');
      }

      if (dto.name && dto.name !== existing.name) {
        const duplicate = await this.prisma.role.findUnique({
          where: {
            name: dto.name,
          },
        });

        if (duplicate) {
          throw new ConflictException(`Role "${dto.name}" sudah digunakan`);
        }
      }

      const updated = await this.prisma.role.update({
        where: {
          id,
        },
        data: {
          ...(dto.name !== undefined && {
            name: dto.name,
          }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
        },
      });

      return {
        message: 'Role berhasil diperbarui',
        data: updated,
      };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Role sudah digunakan');
        }

        if (error.code === 'P2025') {
          throw new NotFoundException('Role tidak ditemukan');
        }
      }

      throw new InternalServerErrorException('Gagal memperbarui role');
    }
  }

  async removeRole(id: string) {
    try {
      const role = await this.prisma.role.findUnique({
        where: {
          id,
        },
        include: {
          _count: {
            select: {
              users: true,
            },
          },
        },
      });

      if (!role) {
        throw new NotFoundException('Role tidak ditemukan');
      }

      if (role._count.users > 0) {
        throw new ConflictException(
          `Role "${role.name}" masih digunakan oleh ${role._count.users} user`,
        );
      }

      await this.prisma.role.delete({
        where: {
          id,
        },
      });

      return {
        message: 'Role berhasil dihapus',
      };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('Role tidak ditemukan');
        }

        if (error.code === 'P2003') {
          throw new ConflictException('Role masih digunakan oleh data lain');
        }
      }

      throw new InternalServerErrorException('Gagal menghapus role');
    }
  }
}
