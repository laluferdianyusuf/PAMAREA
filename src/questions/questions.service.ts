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
      createdBy: {
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
    this.validateQuestionConfiguration(dto.questionType, dto.photoRequirement);

    const code = await this.generateQuestionCode();

    let options: {
      value: string;
      label: string;
      sortOrder: number;
      isSafe: boolean;
    }[] = [];

    switch (dto.questionType) {
      case 'YES_NO':
        options = [
          {
            value: 'YES',
            label: 'Ya',
            sortOrder: 1,
            isSafe: true,
          },
          {
            value: 'NO',
            label: 'Tidak',
            sortOrder: 2,
            isSafe: false,
          },
        ];
        break;

      case 'SINGLE_CHOICE': {
        if (!dto.questionOptions?.length) {
          throw new BadRequestException(
            'Question options wajib diisi untuk SINGLE_CHOICE',
          );
        }

        const normalizedOptions = dto.questionOptions.map((option) => ({
          label: option.label.trim(),
          isSafe: option.isSafe ?? false,
        }));

        if (normalizedOptions.some((option) => !option.label)) {
          throw new BadRequestException('Question options tidak boleh kosong');
        }

        const uniqueLabels = normalizedOptions.map((option) =>
          option.label.toLowerCase(),
        );

        if (new Set(uniqueLabels).size !== uniqueLabels.length) {
          throw new BadRequestException(
            'Question options tidak boleh duplikat',
          );
        }

        options = normalizedOptions.map((option, index) => ({
          value: option.label.toUpperCase(),
          label: option.label,
          sortOrder: index + 1,
          isSafe: option.isSafe,
        }));

        break;
      }

      case 'TEXT':
        if (dto.questionOptions?.length) {
          throw new BadRequestException(
            'Question type TEXT tidak membutuhkan options',
          );
        }

        options = [];
        break;
    }

    return this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          code,
          questionText: dto.questionText.trim(),
          questionType: dto.questionType,
          isRequired: dto.isRequired ?? true,
          photoRequirement: dto.photoRequirement ?? 'REQUIRED',
          createdById,
          options: {
            create: options,
          },
        },
      });

      const patrolPoints = await tx.patrolPoint.findMany({
        select: {
          id: true,
        },
      });

      if (patrolPoints.length > 0) {
        await tx.pointQuestion.createMany({
          data: patrolPoints.map((point, index) => ({
            patrolPointId: point.id,
            questionId: question.id,
            createdById,
            sortOrder: index + 1,
          })),
          skipDuplicates: true,
        });
      }

      return tx.question.findUniqueOrThrow({
        where: {
          id: question.id,
        },
        include: this.questionInclude(),
      });
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

  async findActiveByPoint(patrolPointId: string) {
    const pointQuestions = await this.prisma.pointQuestion.findMany({
      where: {
        patrolPointId,
        question: {
          status: QuestionStatus.ACTIVE,
        },
      },
      include: {
        question: {
          include: {
            options: {
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
        },
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return pointQuestions.map((item) => ({
      ...item.question,
    }));
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

  private async generateQuestionCode(): Promise<string> {
    const lastQuestion = await this.prisma.question.findFirst({
      where: {
        code: {
          startsWith: 'QST-',
        },
      },
      orderBy: {
        code: 'desc',
      },
      select: {
        code: true,
      },
    });

    let nextNumber = 1;

    if (lastQuestion) {
      const lastNumber = Number(lastQuestion.code.replace('QST-', ''));

      if (Number.isInteger(lastNumber) && lastNumber > 0) {
        nextNumber = lastNumber + 1;
      }
    }

    return `QST-${String(nextNumber).padStart(4, '0')}`;
  }
}
