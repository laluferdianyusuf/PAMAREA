import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: any) {
    if (!payload.sub || !payload.sessionId || payload.type !== 'access') {
      throw new UnauthorizedException('Access token tidak valid');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        deletedAt: null,
      },
      include: {
        role: true,
        site: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User tidak ditemukan');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User tidak aktif');
    }

    const session = await this.prisma.session.findUnique({
      where: {
        id: payload.sessionId,
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

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roleId: user.roleId,
      role: user.role.name,
      siteId: user.siteId,
      sessionId: payload.sessionId,
    };
  }
}
