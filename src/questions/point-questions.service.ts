import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssignQuestionDto } from './dto/assign-question.dto.js';
import { UpdatePointQuestionDto } from './dto/update-point-question.dto.js';

@Injectable()
export class PointQuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  private include() {
    return {
      question: {
        include: {
          options: {
            orderBy: {
              sortOrder: 'asc' as const,
            },
          },
        },
      },

      patrolPoint: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      },

      createdBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
    } satisfies Prisma.PointQuestionInclude;
  }

  async assign(dto: AssignQuestionDto, createdById: string) {
    const [point, question] = await Promise.all([
      this.prisma.patrolPoint.findFirst({
        where: {
          id: dto.patrolPointId,
          deletedAt: null,
        },
      }),

      this.prisma.question.findUnique({
        where: {
          id: dto.questionId,
        },
      }),
    ]);

    if (!point) {
      throw new NotFoundException('Patrol point tidak ditemukan');
    }

    if (point.status !== 'ACTIVE') {
      throw new BadRequestException('Patrol point tidak aktif');
    }

    if (!question) {
      throw new NotFoundException('Question tidak ditemukan');
    }

    if (question.status !== QuestionStatus.ACTIVE) {
      throw new BadRequestException('Question tidak aktif');
    }

    const existing = await this.prisma.pointQuestion.findUnique({
      where: {
        patrolPointId_questionId: {
          patrolPointId: dto.patrolPointId,
          questionId: dto.questionId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Question sudah dipasang pada patrol point ini',
      );
    }

    return this.prisma.pointQuestion.create({
      data: {
        patrolPointId: dto.patrolPointId,
        questionId: dto.questionId,
        sortOrder: dto.sortOrder ?? 0,
        isRequired: dto.isRequired ?? question.isRequired,
        createdById: createdById,
      },

      include: this.include(),
    });
  }

  async findByPatrolPoint(patrolPointId: string) {
    return this.prisma.pointQuestion.findMany({
      where: {
        patrolPointId,

        question: {
          status: QuestionStatus.ACTIVE,
        },
      },

      include: this.include(),

      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.pointQuestion.findUnique({
      where: {
        id,
      },

      include: this.include(),
    });

    if (!item) {
      throw new NotFoundException('Point question tidak ditemukan');
    }

    return item;
  }

  async update(id: string, dto: UpdatePointQuestionDto) {
    const item = await this.prisma.pointQuestion.findUnique({
      where: {
        id,
      },
    });

    if (!item) {
      throw new NotFoundException('Point question tidak ditemukan');
    }

    return this.prisma.pointQuestion.update({
      where: {
        id,
      },

      data: {
        ...(dto.sortOrder !== undefined
          ? {
              sortOrder: dto.sortOrder,
            }
          : {}),

        ...(dto.isRequired !== undefined
          ? {
              isRequired: dto.isRequired,
            }
          : {}),
      },

      include: this.include(),
    });
  }

  async remove(id: string) {
    const item = await this.prisma.pointQuestion.findUnique({
      where: {
        id,
      },
    });

    if (!item) {
      throw new NotFoundException('Point question tidak ditemukan');
    }

    const answerCount = await this.prisma.patrolAnswer.count({
      where: {
        questionId: item.questionId,
      },
    });

    if (answerCount > 0) {
      throw new BadRequestException(
        'Question tidak dapat dilepas karena sudah digunakan dalam patrol',
      );
    }

    await this.prisma.pointQuestion.delete({
      where: {
        id,
      },
    });

    return {
      success: true,
      message: 'Question berhasil dilepas dari patrol point',
    };
  }
}
