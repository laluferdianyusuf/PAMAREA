import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class PatrolCheckpointService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const checkpoint = await this.prisma.patrolCheckpoint.findUnique({
      where: { id },
      include: {
        round: {
          include: {
            assignment: {
              include: {
                user: true,
                schedule: true,
              },
            },
          },
        },
        patrolPoint: true,
        patrol: true,
      },
    });

    if (!checkpoint) {
      throw new NotFoundException('Patrol checkpoint not found');
    }

    return checkpoint;
  }
}
