import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class PatrolRoundService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const round = await this.prisma.patrolRound.findUnique({
      where: { id },
      include: {
        assignment: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                employeeNumber: true,
              },
            },
            schedule: true,
          },
        },
        scheduleDate: true,
        checkpoints: {
          orderBy: {
            sequence: 'asc',
          },
        },
      },
    });

    if (!round) {
      throw new NotFoundException('Patrol round not found');
    }

    return round;
  }

  async start(id: string) {
    const round = await this.findById(id);

    if (round.status !== 'PENDING') {
      throw new ConflictException('Round cannot be started');
    }

    return this.prisma.patrolRound.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
  }
}
