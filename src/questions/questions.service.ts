import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuestionStatus,
  QuestionType,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateQuestionOptionDto } from './dto/create-question-option.dto.js';
import { CreateQuestionDto } from './dto/create-questions.dto.js';
import { UpdateQuestionOptionDto } from './dto/update-question-option.dto.js';
import { UpdateQuestionDto } from './dto/update-questions.dto.js';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  private questionInclude() {
    return {
      creator: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },

      options: {
        orderBy: {
          sortOrder: 'asc' as const,
        },
      },

      _count: {
        select: {
          pointQuestions: true,
          patrolAnswers: true,
        },
      },
    } satisfies Prisma.QuestionInclude;
  }

  async create(dto: CreateQuestionDto, createdById: string) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.question.findUnique({
      where: {
        code,
      },
    });

    if (existing) {
      throw new ConflictException(`Question code "${code}" sudah digunakan`);
    }

    this.validateQuestionConfiguration(dto.questionType, dto.photoRequirement);

    return this.prisma.question.create({
      data: {
        code,
        questionText: dto.questionText.trim(),
        questionType: dto.questionType,
        isRequired: dto.isRequired ?? true,
        photoRequirement: dto.photoRequirement ?? 'NONE',
        createdBy: createdById,
      },

      include: this.questionInclude(),
    });
  }

  async findAll(params?: {
    status?: QuestionStatus;
    questionType?: QuestionType;
  }) {
    return this.prisma.question.findMany({
      where: {
        ...(params?.status
          ? {
              status: params.status,
            }
          : {}),

        ...(params?.questionType
          ? {
              questionType: params.questionType,
            }
          : {}),
      },

      include: this.questionInclude(),

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findActive() {
    return this.prisma.question.findMany({
      where: {
        status: QuestionStatus.ACTIVE,
      },

      include: {
        options: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },

      orderBy: {
        code: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const question = await this.prisma.question.findUnique({
      where: {
        id,
      },

      include: this.questionInclude(),
    });

    if (!question) {
      throw new NotFoundException('Question tidak ditemukan');
    }

    return question;
  }

  async update(id: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({
      where: {
        id,
      },
    });

    if (!question) {
      throw new NotFoundException('Question tidak ditemukan');
    }

    return this.prisma.question.update({
      where: {
        id,
      },

      data: {
        ...(dto.questionText !== undefined
          ? {
              questionText: dto.questionText.trim(),
            }
          : {}),

        ...(dto.isRequired !== undefined
          ? {
              isRequired: dto.isRequired,
            }
          : {}),

        ...(dto.photoRequirement !== undefined
          ? {
              photoRequirement: dto.photoRequirement,
            }
          : {}),

        ...(dto.status !== undefined
          ? {
              status: dto.status,
            }
          : {}),
      },

      include: this.questionInclude(),
    });
  }

  async deactivate(id: string) {
    const question = await this.prisma.question.findUnique({
      where: {
        id,
      },
    });

    if (!question) {
      throw new NotFoundException('Question tidak ditemukan');
    }

    return this.prisma.question.update({
      where: {
        id,
      },

      data: {
        status: QuestionStatus.INACTIVE,
      },

      include: this.questionInclude(),
    });
  }

  async activate(id: string) {
    const question = await this.prisma.question.findUnique({
      where: {
        id,
      },
    });

    if (!question) {
      throw new NotFoundException('Question tidak ditemukan');
    }

    return this.prisma.question.update({
      where: {
        id,
      },

      data: {
        status: QuestionStatus.ACTIVE,
      },

      include: this.questionInclude(),
    });
  }

  // OPTIONS

  async addOption(questionId: string, dto: CreateQuestionOptionDto) {
    const question = await this.prisma.question.findUnique({
      where: {
        id: questionId,
      },
    });

    if (!question) {
      throw new NotFoundException('Question tidak ditemukan');
    }

    if (['YES_NO', 'SINGLE_CHOICE'].includes(question.questionType))
      try {
        return await this.prisma.questionOption.create({
          data: {
            questionId,

            value: dto.value.trim().toUpperCase(),

            label: dto.label.trim(),

            sortOrder: dto.sortOrder,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Option dengan value tersebut sudah ada');
        }

        throw error;
      }
  }

  async updateOption(optionId: string, dto: UpdateQuestionOptionDto) {
    const option = await this.prisma.questionOption.findUnique({
      where: {
        id: optionId,
      },
    });

    if (!option) {
      throw new NotFoundException('Question option tidak ditemukan');
    }

    try {
      return await this.prisma.questionOption.update({
        where: {
          id: optionId,
        },

        data: {
          ...(dto.value !== undefined
            ? {
                value: dto.value.trim().toUpperCase(),
              }
            : {}),

          ...(dto.label !== undefined
            ? {
                label: dto.label.trim(),
              }
            : {}),

          ...(dto.sortOrder !== undefined
            ? {
                sortOrder: dto.sortOrder,
              }
            : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Option dengan value tersebut sudah ada');
      }

      throw error;
    }
  }

  async removeOption(optionId: string) {
    const option = await this.prisma.questionOption.findUnique({
      where: {
        id: optionId,
      },

      include: {
        question: true,
      },
    });

    if (!option) {
      throw new NotFoundException('Question option tidak ditemukan');
    }

    const answerCount = await this.prisma.patrolAnswer.count({
      where: {
        questionId: option.questionId,
      },
    });

    if (answerCount > 0) {
      throw new BadRequestException(
        'Option tidak dapat dihapus karena question sudah digunakan dalam patrol',
      );
    }

    await this.prisma.questionOption.delete({
      where: {
        id: optionId,
      },
    });

    return {
      success: true,
      message: 'Question option berhasil dihapus',
    };
  }

  private validateQuestionConfiguration(
    type: QuestionType,
    photoRequirement?: string,
  ) {
    if (
      ![
        QuestionType.TEXT,
        QuestionType.SINGLE_CHOICE,
        QuestionType.YES_NO,
      ].includes(type)
    ) {
      throw new BadRequestException('Question type tidak valid');
    }
  }
}
