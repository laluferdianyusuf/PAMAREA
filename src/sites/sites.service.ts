import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SiteStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSitesDto } from './dto/create-sites.dto.js';
import { UpdateSitesDto } from './dto/update-sites.dto.js';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllSites() {
    const sites = await this.prisma.site.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Data site berhasil ditemukan',
      data: sites,
    };
  }

  async findAllActiveSites() {
    const sites = await this.prisma.site.findMany({
      where: {
        status: SiteStatus.ACTIVE,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      message: 'Data site aktif berhasil ditemukan',
      data: sites,
    };
  }

  async findSiteById(id: string) {
    const site = await this.prisma.site.findUnique({
      where: {
        id,
      },
    });

    if (!site) {
      throw new NotFoundException('Site tidak ditemukan');
    }

    return {
      message: 'Site berhasil ditemukan',
      data: site,
    };
  }

  async createSite(dto: CreateSitesDto, createdById: string) {
    try {
      const existing = await this.prisma.site.findUnique({
        where: {
          code: dto.code,
        },
      });

      if (existing) {
        throw new ConflictException(`Site dengan code "${dto.code}" sudah ada`);
      }

      const created = await this.prisma.site.create({
        data: {
          createdById: createdById,
          code: dto.code,
          name: dto.name,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
        },
      });

      return {
        message: 'Site berhasil ditambahkan',
        data: created,
      };
    } catch (error: any) {
      if (error instanceof ConflictException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Site dengan code "${dto.code}" sudah ada`);
      }

      throw new InternalServerErrorException('Gagal menambahkan site');
    }
  }

  async updateSite(id: string, dto: UpdateSitesDto) {
    const existingSite = await this.prisma.site.findUnique({
      where: {
        id,
      },
    });

    if (!existingSite) {
      throw new NotFoundException('Site tidak ditemukan');
    }

    if (dto.code && dto.code !== existingSite.code) {
      const existingCode = await this.prisma.site.findUnique({
        where: {
          code: dto.code,
        },
      });

      if (existingCode) {
        throw new ConflictException(
          `Site dengan code "${dto.code}" sudah digunakan`,
        );
      }
    }

    try {
      const updated = await this.prisma.site.update({
        where: {
          id,
        },
        data: {
          ...(dto.code !== undefined && {
            code: dto.code,
          }),

          ...(dto.name !== undefined && {
            name: dto.name,
          }),

          ...(dto.address !== undefined && {
            address: dto.address,
          }),

          ...(dto.latitude !== undefined && {
            latitude: dto.latitude,
          }),

          ...(dto.longitude !== undefined && {
            longitude: dto.longitude,
          }),
        },
      });

      return {
        message: 'Site berhasil diperbarui',
        data: updated,
      };
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Code site sudah digunakan oleh site lain');
      }

      throw new InternalServerErrorException('Gagal memperbarui site');
    }
  }

  async deactivateSite(id: string) {
    const existingSite = await this.prisma.site.findUnique({
      where: {
        id,
      },
    });

    if (!existingSite) {
      throw new NotFoundException('Site tidak ditemukan');
    }

    if (existingSite.status === SiteStatus.INACTIVE) {
      throw new ConflictException('Site sudah tidak aktif');
    }

    try {
      const updated = await this.prisma.site.update({
        where: {
          id,
        },
        data: {
          status: SiteStatus.INACTIVE,
        },
      });

      return {
        message: 'Site berhasil dinonaktifkan',
        data: updated,
      };
    } catch (error) {
      throw new InternalServerErrorException('Gagal menonaktifkan site');
    }
  }

  async activateSite(id: string) {
    const existingSite = await this.prisma.site.findUnique({
      where: {
        id,
      },
    });

    if (!existingSite) {
      throw new NotFoundException('Site tidak ditemukan');
    }

    if (existingSite.status === SiteStatus.ACTIVE) {
      throw new ConflictException('Site sudah aktif');
    }

    try {
      const updated = await this.prisma.site.update({
        where: {
          id,
        },
        data: {
          status: SiteStatus.ACTIVE,
        },
      });

      return {
        message: 'Site berhasil diaktifkan',
        data: updated,
      };
    } catch (error) {
      throw new InternalServerErrorException('Gagal mengaktifkan site');
    }
  }

  async removeSite(id: string) {
    const existingSite = await this.prisma.site.findUnique({
      where: {
        id,
      },
    });

    if (!existingSite) {
      throw new NotFoundException('Site tidak ditemukan');
    }

    try {
      await this.prisma.site.delete({
        where: {
          id,
        },
      });

      return {
        message: 'Site berhasil dihapus',
      };
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Site tidak dapat dihapus karena masih digunakan oleh data lain',
        );
      }

      throw new InternalServerErrorException('Gagal menghapus site');
    }
  }
}
