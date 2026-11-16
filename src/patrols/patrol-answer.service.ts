import { Injectable, NotFoundException } from '@nestjs/common';
import { QuestionType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PatrolWarningService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(patrolId: string) {
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: patrolId,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
          },
        },
        site: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        patrolPoint: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        // Mengambil semua jawaban dari patroli ini.
        answers: {
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
            photos: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!patrol) {
      throw new NotFoundException('Data patroli tidak ditemukan');
    }

    const unsafeAnswers = patrol.answers.filter((answer) =>
      this.isUnsafeAnswer(answer),
    );

    if (unsafeAnswers.length === 0) {
      throw new NotFoundException(
        'Tidak ditemukan jawaban tidak aman pada patroli ini',
      );
    }

    return {
      patrol: {
        id: patrol.id,
        reportNumber: patrol.reportNumber,
        startedAt: patrol.startedAt,
        completedAt: patrol.completedAt,
        status: patrol.status,
      },

      security: {
        id: patrol.user.id,
        fullName: patrol.user.fullName,
        employeeNumber: patrol.user.employeeNumber,
      },

      site: patrol.site,

      patrolPoint: patrol.patrolPoint,

      unsafeCount: unsafeAnswers.length,

      unsafeAnswers: unsafeAnswers.map((answer) => {
        const selectedOption =
          answer.question.questionType === QuestionType.SINGLE_CHOICE
            ? (answer.question.options.find(
                (option) => option.value === answer.answerValue,
              ) ?? null)
            : null;

        return {
          id: answer.id,

          question: {
            id: answer.questionId,
            code: answer.question.code,
            text: answer.questionTextSnapshot,
            type: answer.question.questionType,
            isRequired: answer.question.isRequired,
            photoRequirement: answer.question.photoRequirement,
          },

          answer: {
            value: answer.answerValue,
            label: answer.answerLabelSnapshot,
            isUnsafe: true,
            selectedOption: selectedOption
              ? {
                  id: selectedOption.id,
                  value: selectedOption.value,
                  label: selectedOption.label,
                  isSafe: selectedOption.isSafe,
                }
              : null,
          },

          photos: answer.photos.map((photo) => ({
            id: photo.id,
            fileUrl: photo.fileUrl,
            fileName: photo.fileName,
            mimeType: photo.mimeType,
            fileSize: photo.fileSize,
            capturedAt: photo.capturedAt,
            latitude: photo.latitude,
            longitude: photo.longitude,
          })),

          createdAt: answer.createdAt,
        };
      }),
    };
  }

  private isUnsafeAnswer(answer: {
    answerValue: string | null;
    question: {
      questionType: QuestionType;
      options: {
        value: string;
        isSafe: boolean;
      }[];
    };
  }): boolean {
    switch (answer.question.questionType) {
      case QuestionType.YES_NO:
        return answer.answerValue === 'NO';

      case QuestionType.SINGLE_CHOICE: {
        const selectedOption = answer.question.options.find(
          (option) => option.value === answer.answerValue,
        );

        return selectedOption?.isSafe === false;
      }

      case QuestionType.TEXT:
        return false;

      default:
        return false;
    }
  }
}
