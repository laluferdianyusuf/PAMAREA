import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../prisma/prisma.service.js';

import { LoginDto } from './dto/login.dto.js';

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { RegisterDto } from './dto/register.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, createdById?: string) {
    const existingUsername = await this.prisma.user.findUnique({
      where: {
        username: dto.username,
      },
    });

    if (existingUsername) {
      throw new ConflictException('Username sudah digunakan');
    }

    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: {
          email: dto.email,
        },
      });

      if (existingEmail) {
        throw new ConflictException('Email sudah digunakan');
      }
    }

    if (dto.employeeNumber) {
      const existingEmployee = await this.prisma.user.findUnique({
        where: {
          employeeNumber: dto.employeeNumber,
        },
      });

      if (existingEmployee) {
        throw new ConflictException('Employee number sudah digunakan');
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
        throw new ConflictException('Site tidak aktif');
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

        status: 'ACTIVE',
      },

      include: {
        role: true,
        site: true,
      },
    });

    return {
      message: 'User berhasil didaftarkan',

      data: this.sanitizeUser(user),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        username: dto.username,
        deletedAt: null,
      },

      include: {
        role: true,
        site: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Username atau password salah');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User tidak aktif');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException('Username atau password salah');
    }

    const sessionId = randomUUID();

    const tokens = await this.generateTokens(user.id, sessionId);

    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);

    const refreshExpiresIn = 30 * 24 * 60 * 60 * 1000;

    await this.prisma.session.create({
      data: {
        id: sessionId,

        userId: user.id,

        refreshTokenHash,

        expiresAt: new Date(Date.now() + refreshExpiresIn),
      },
    });

    await this.prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        lastLoginAt: new Date(),
      },
    });

    return {
      message: 'Login berhasil',

      data: {
        accessToken: tokens.accessToken,

        refreshToken: tokens.refreshToken,

        expiresIn: 900,

        user: this.sanitizeUser(user),
      },
    };
  }

  async refresh(refreshToken: string) {
    let payload: any;

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token tidak valid atau expired');
    }

    if (payload.type !== 'refresh' || !payload.sub || !payload.sessionId) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }

    const session = await this.prisma.session.findUnique({
      where: {
        id: payload.sessionId,
      },

      include: {
        user: {
          include: {
            role: true,
            site: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Session tidak ditemukan');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException('Session sudah logout');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session sudah expired');
    }

    const valid = await bcrypt.compare(refreshToken, session.refreshTokenHash);

    if (!valid) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }

    const user = session.user;

    if (user.status !== 'ACTIVE' || user.deletedAt) {
      throw new UnauthorizedException('User tidak aktif');
    }

    const tokens = await this.generateTokens(user.id, session.id);

    const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);

    await this.prisma.session.update({
      where: {
        id: session.id,
      },

      data: {
        refreshTokenHash: newRefreshTokenHash,

        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      message: 'Token berhasil diperbarui',

      data: {
        accessToken: tokens.accessToken,

        refreshToken: tokens.refreshToken,

        expiresIn: 900,
      },
    };
  }

  async logout(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!session) {
      throw new NotFoundException('Session tidak ditemukan');
    }

    if (!session.revokedAt) {
      await this.prisma.session.update({
        where: {
          id: sessionId,
        },

        data: {
          revokedAt: new Date(),
        },
      });
    }

    return {
      message: 'Logout berhasil',
    };
  }

  async logoutAll(userId: string) {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },

      data: {
        revokedAt: new Date(),
      },
    });

    return {
      message: 'Semua session berhasil dikeluarkan',

      revokedSessions: result.count,
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
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

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User tidak aktif');
    }

    return {
      message: 'Data user berhasil ditemukan',

      data: this.sanitizeUser(user),
    };
  }

  private async generateTokens(userId: string, sessionId: string) {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: userId,
        sessionId,
        type: 'access',
      },

      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),

        expiresIn: '15m',
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: userId,
        sessionId,
        type: 'refresh',
      },

      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),

        expiresIn: '30d',
      },
    );

    return {
      accessToken,
      refreshToken,
    };
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...safeUser } = user;

    return safeUser;
  }
}
