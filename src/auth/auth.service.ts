import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

import { AuditLogService } from '../audit/audit.service.js';
import { UploadedFile } from '../common/types/uploaded-file.type.js';
import { generateEmployeeNumber } from '../common/utils/employee-number.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { UserStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.js';
import { RefreshTokenPayload } from './interfaces/refresh-token.interface.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async register(dto: RegisterDto, createdById?: string) {
    if (dto.teamId && dto.team) {
      throw new BadRequestException(
        'Gunakan teamId untuk regu yang sudah ada atau team untuk membuat regu baru.',
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
      });

      if (!site) {
        throw new NotFoundException('Site tidak ditemukan atau tidak aktif.');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
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
          });

          teamId = team.id;

          createdTeam = {
            id: team.id,
            name: team.name,
            code: team.code,
          };
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
            photoUrl: dto.photoUrl ?? null,
            passwordHash,
            status: 'ACTIVE',
            teamId,
          },
          include: {
            role: true,
            site: true,
            team: true,
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId: createdById ?? user.id,
          action: 'REGISTER_USER',
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
            registrationType: createdById ? 'ADMIN' : 'SELF',
            ...(createdTeam ? { createdTeam } : {}),
          },
        });

        return user;
      });

      return this.sanitizeUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Username, email, nomor karyawan, atau nama/kode regu sudah digunakan.',
        );
      }

      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        username: dto.username,
        deletedAt: null,
      },
      include: {
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
            name: true,
            code: true,
            address: true,
            status: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Username atau password salah');
    }

    if (user.status !== UserStatus.ACTIVE) {
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
    const loginAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          refreshTokenHash,
          expiresAt: new Date(Date.now() + refreshExpiresIn),
        },
      });

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          lastLoginAt: loginAt,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        entityType: 'SESSION',
        entityId: sessionId,
        newData: {
          sessionId,
          userId: user.id,
          username: user.username,
          roleName: user.role.name,
          siteId: user.siteId,
          loginAt: loginAt.toISOString(),
        },
      });
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
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );
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
                name: true,
                code: true,
                address: true,
                status: true,
              },
            },
            team: {
              select: {
                id: true,
                name: true,
                code: true,
                description: true,
              },
            },
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

    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session sudah expired');
    }

    const valid = await bcrypt.compare(refreshToken, session.refreshTokenHash);

    if (!valid) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }

    const user = session.user;

    if (user.status !== UserStatus.ACTIVE || user.deletedAt) {
      throw new UnauthorizedException('User tidak aktif');
    }

    if (payload.sub !== user.id) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }

    const tokens = await this.generateTokens(user.id, session.id);
    const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);
    const refreshedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: {
          id: session.id,
        },
        data: {
          refreshTokenHash: newRefreshTokenHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId: user.id,
        action: 'REFRESH_TOKEN',
        entityType: 'SESSION',
        entityId: session.id,
        newData: {
          sessionId: session.id,
          refreshedAt: refreshedAt.toISOString(),
          expiresAt: new Date(
            refreshedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      });
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

  async logout(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!session) {
      throw new NotFoundException('Session tidak ditemukan');
    }

    if (session.userId !== userId) {
      throw new UnauthorizedException('Session tidak valid');
    }

    if (!session.revokedAt) {
      await this.prisma.$transaction(async (tx) => {
        const revokedAt = new Date();

        await tx.session.update({
          where: {
            id: sessionId,
          },
          data: {
            revokedAt,
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId,
          action: 'LOGOUT',
          entityType: 'SESSION',
          entityId: sessionId,
          oldData: {
            revokedAt: null,
          },
          newData: {
            revokedAt: revokedAt.toISOString(),
          },
        });
      });
    }

    return {
      message: 'Logout berhasil',
    };
  }

  async logoutAll(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const activeSessions = await tx.session.findMany({
        where: {
          userId,
          revokedAt: null,
        },
        select: {
          id: true,
        },
      });

      const revokedAt = new Date();

      const result = await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'LOGOUT_ALL',
        entityType: 'USER',
        entityId: userId,
        newData: {
          revokedSessions: result.count,
          sessionIds: activeSessions.map((session) => session.id),
          revokedAt: revokedAt.toISOString(),
        },
      });

      return {
        message: 'Semua session berhasil dikeluarkan',
        revokedSessions: result.count,
      };
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: {
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
            name: true,
            code: true,
            address: true,
            status: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User tidak aktif');
    }

    return {
      message: 'Data user berhasil ditemukan',
      data: this.sanitizeUser(user),
    };
  }

  async changeMyPhoto(userId: string, file: UploadedFile) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User tidak aktif');
    }

    const savedPhoto = await this.storageService.saveUserPhoto(file);

    try {
      const updatedUser = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: {
            id: userId,
          },
          data: {
            photoUrl: savedPhoto.url,
          },
          include: {
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
                name: true,
                code: true,
                address: true,
                status: true,
              },
            },
            team: {
              select: {
                id: true,
                name: true,
                code: true,
                description: true,
              },
            },
          },
        });

        await this.auditLogService.createAudit(tx, {
          userId,
          action: 'CHANGE_MY_PHOTO',
          entityType: 'USER',
          entityId: userId,
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
        message: 'Foto profil berhasil diperbarui',
        data: this.sanitizeUser(updatedUser),
      };
    } catch (error) {
      console.error('CHANGE MY PHOTO ERROR:', error);

      throw new InternalServerErrorException('Gagal memperbarui foto profil');
    }
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

  private async generateUniqueEmployeeNumber(
    roleName: Parameters<typeof generateEmployeeNumber>[0],
  ): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const employeeNumber = generateEmployeeNumber(roleName);

      const existing = await this.prisma.user.findUnique({
        where: {
          employeeNumber,
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        return employeeNumber;
      }
    }

    throw new InternalServerErrorException(
      'Gagal membuat employee number unik',
    );
  }

  private sanitizeUser<T extends { passwordHash: string }>(
    user: T,
  ): Omit<T, 'passwordHash'> {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
