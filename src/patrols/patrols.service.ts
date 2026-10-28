import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../audit/audit.service.js';
import { UploadedFile } from '../common/types/uploaded-file.type.js';
import { EmergencyService } from '../emergency/emergency.service.js';
import {
  GpsValidationStatus,
  NfcValidationStatus,
  PatrolCheckpointStatus,
  PatrolRoundStatus,
  PatrolStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { BypassNfcDto } from './dto/bypass-nfc.dto.js';
import { StartPatrolDto } from './dto/start-patrol.dto.js';
import { SubmitAnswersDto } from './dto/submit-answers.dto.js';
import { SubmitPhotoDto } from './dto/submit-photo.dto.js';
import { ValidateLocationDto } from './dto/validate-location.dto.js';
import { GpsValidationService } from './services/gps-validation.service.js';
import { NfcValidationService } from './services/nfc-validation.service.js';

@Injectable()
export class PatrolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gpsValidationService: GpsValidationService,
    private readonly nfcValidationService: NfcValidationService,
    private readonly storageService: StorageService,
    private readonly emergencyService: EmergencyService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getToday(userId: string) {
    const today = this.startOfToday();

    const assignments = await this.prisma.patrolScheduleAssignment.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        startDate: {
          lte: today,
        },
        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: today,
            },
          },
        ],
      },
      include: {
        schedule: {
          include: {
            site: true,
          },
        },
        rounds: {
          where: {
            scheduleDate: {
              date: today,
            },
          },
          orderBy: {
            roundNumber: 'asc',
          },
          include: {
            checkpoints: {
              orderBy: {
                sequence: 'asc',
              },
            },
          },
        },
      },
    });

    return assignments.map((assignment) => ({
      assignmentId: assignment.id,
      schedule: {
        id: assignment.schedule.id,
        name: assignment.schedule.name,
        startTime: assignment.schedule.startTime,
        endTime: assignment.schedule.endTime,
        intervalMinutes: assignment.schedule.intervalMinutes,
        gracePeriodMinutes: assignment.schedule.gracePeriodMinutes,
        enforceSequence: assignment.schedule.enforceSequence,
      },
      site: {
        id: assignment.schedule.site.id,
        code: assignment.schedule.site.code,
        name: assignment.schedule.site.name,
        address: assignment.schedule.site.address,
      },
      rounds: assignment.rounds,
    }));
  }

  async startPatrol(checkpointId: string, userId: string, dto: StartPatrolDto) {
    const checkpoint = await this.prisma.patrolCheckpoint.findUnique({
      where: { id: checkpointId },
      include: {
        round: {
          include: {
            scheduleDate: {
              include: { schedule: true },
            },
            assignment: true,
          },
        },
        patrolPoint: true,
      },
    });

    if (!checkpoint) {
      throw new NotFoundException({
        code: 'CHECKPOINT_NOT_FOUND',
        message: 'Checkpoint tidak ditemukan',
      });
    }

    const round = checkpoint.round;
    const schedule = round.scheduleDate.schedule;
    const assignment = round.assignment;

    if (assignment.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'CHECKPOINT_ACCESS_DENIED',
        message: 'Checkpoint ini bukan milik Anda',
      });
    }

    const today = this.startOfToday();

    if (new Date(round.scheduleDate.date).getTime() !== today.getTime()) {
      throw new UnprocessableEntityException({
        code: 'CHECKPOINT_NOT_TODAY',
        message: 'Checkpoint ini bukan untuk hari ini',
      });
    }

    if (
      checkpoint.status === PatrolCheckpointStatus.COMPLETED ||
      checkpoint.status === PatrolCheckpointStatus.CANCELLED
    ) {
      throw new UnprocessableEntityException({
        code: 'CHECKPOINT_NOT_AVAILABLE',
        message: 'Checkpoint sudah tidak dapat diproses',
      });
    }

    if (schedule.enforceSequence) {
      const previousCheckpoint = await this.prisma.patrolCheckpoint.findFirst({
        where: {
          roundId: round.id,
          sequence: { lt: checkpoint.sequence },
          required: true,
          status: { not: PatrolCheckpointStatus.COMPLETED },
        },
        orderBy: { sequence: 'asc' },
      });

      if (previousCheckpoint) {
        throw new UnprocessableEntityException({
          code: 'CHECKPOINT_SEQUENCE_REQUIRED',
          message: 'Checkpoint sebelumnya belum selesai',
          details: {
            previousCheckpointId: previousCheckpoint.id,
          },
        });
      }
    }

    const existingPatrol = await this.prisma.patrol.findFirst({
      where: {
        checkpointId: checkpoint.id,
        userId,
        status: {
          in: [
            PatrolStatus.STARTED,
            PatrolStatus.VALIDATED,
            PatrolStatus.IN_PROGRESS,
          ],
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (existingPatrol) {
      return this.getPatrol(existingPatrol.id, userId);
    }

    const reportNumber = await this.generateReportNumber();
    const startedAt = new Date();

    const patrol = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patrol.create({
        data: {
          reportNumber,
          userId,
          siteId: schedule.siteId,
          patrolPointId: checkpoint.patrolPointId,
          scheduleAssignmentId: assignment.id,
          checkpointId: checkpoint.id,
          deviceId: dto.deviceId ?? null,
          status: PatrolStatus.STARTED,
          startedAt,
        },
      });

      await tx.patrolCheckpoint.update({
        where: { id: checkpoint.id },
        data: {
          status: PatrolCheckpointStatus.IN_PROGRESS,
        },
      });

      if (round.status === PatrolRoundStatus.PENDING) {
        await tx.patrolRound.update({
          where: { id: round.id },
          data: {
            status: PatrolRoundStatus.IN_PROGRESS,
            startedAt,
          },
        });
      }

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'START_PATROL',
        entityType: 'Patrol',
        entityId: created.id,
        oldData: {
          patrolStatus: null,
          checkpointStatus: checkpoint.status,
          roundStatus: round.status,
        },
        newData: {
          reportNumber: created.reportNumber,
          patrolStatus: created.status,
          checkpointId: checkpoint.id,
          checkpointStatus: PatrolCheckpointStatus.IN_PROGRESS,
          roundId: round.id,
          roundStatus:
            round.status === PatrolRoundStatus.PENDING
              ? PatrolRoundStatus.IN_PROGRESS
              : round.status,
          scheduleAssignmentId: assignment.id,
          patrolPointId: checkpoint.patrolPointId,
          siteId: schedule.siteId,
          startedAt: startedAt.toISOString(),
        },
      });

      return created;
    });

    return this.getPatrol(patrol.id, userId);
  }

  async startNextPatrol(userId: string) {
    const today = this.startOfToday();
    const now = new Date();

    const assignments = await this.prisma.patrolScheduleAssignment.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      include: {
        schedule: true,
        rounds: {
          where: {
            scheduleDate: {
              date: today,
            },
            status: {
              in: ['PENDING', 'IN_PROGRESS'],
            },
            scheduledStartAt: { lte: now },
          },
          orderBy: {
            scheduledStartAt: 'asc',
          },
          include: {
            scheduleDate: true,
            checkpoints: {
              orderBy: {
                sequence: 'asc',
              },
            },
          },
        },
      },
    });

    const rounds = assignments
      .flatMap((assignment) =>
        assignment.rounds.map((round) => ({
          assignment,
          round,
        })),
      )
      .sort((a, b) => {
        const aActive = a.round.status === 'IN_PROGRESS' ? 0 : 1;
        const bActive = b.round.status === 'IN_PROGRESS' ? 0 : 1;

        return (
          aActive - bActive ||
          a.round.scheduledStartAt.getTime() -
            b.round.scheduledStartAt.getTime()
        );
      });

    const device = await this.prisma.userDevice.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
    });

    if (!device) {
      throw new NotFoundException('Perangkat belum terdaftar untuk akun ini');
    }

    const deviceId = device.id;

    for (const { assignment, round } of rounds) {
      let checkpoint;

      if (assignment.schedule.enforceSequence) {
        const previous = await this.prisma.patrolCheckpoint.findFirst({
          where: {
            roundId: round.id,
            required: true,
            status: {
              not: 'COMPLETED',
            },
          },
          orderBy: {
            sequence: 'asc',
          },
        });

        if (!previous) {
          continue;
        }

        if (
          previous.status !== 'PENDING' &&
          previous.status !== 'IN_PROGRESS'
        ) {
          continue;
        }

        checkpoint = previous;
      } else {
        checkpoint = round.checkpoints.find(
          (item) => item.status === 'PENDING' || item.status === 'IN_PROGRESS',
        );
      }

      if (!checkpoint) continue;

      const existingPatrol = await this.prisma.patrol.findFirst({
        where: {
          checkpointId: checkpoint.id,
          userId,
          status: {
            in: [
              PatrolStatus.STARTED,
              PatrolStatus.VALIDATED,
              PatrolStatus.IN_PROGRESS,
            ],
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
      });

      if (existingPatrol) {
        return this.getPatrol(existingPatrol.id, userId);
      }

      return this.startPatrol(checkpoint.id, userId, {
        deviceId: deviceId ?? '',
      });
    }

    throw new UnprocessableEntityException({
      code: 'NO_AVAILABLE_CHECKPOINT',
      message:
        'Tidak ada checkpoint yang dapat dimulai saat ini. Periksa jadwal, ronde, dan penugasan Anda.',
    });
  }

  async getPatrol(patrolId: string, userId: string) {
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: patrolId,
      },
      include: {
        site: true,
        patrolPoint: true,
        checkpoint: {
          include: {
            patrolPoint: {
              include: {
                site: true,
              },
            },
            round: {
              include: {
                scheduleDate: {
                  include: {
                    schedule: true,
                  },
                },
              },
            },
          },
        },
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
        },
        photos: true,
        findings: {
          include: {
            photos: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke patrol ini',
      });
    }

    return {
      ...patrol,
      siteName: patrol.site.name,
    };
  }

  async bypassNfc(patrolId: string, userId: string, dto: BypassNfcDto) {
    const patrol = await this.prisma.patrol.findUnique({
      where: { id: patrolId },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke patrol ini',
      });
    }

    if (patrol.status === PatrolStatus.SUBMITTED) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ALREADY_SUBMITTED',
        message: 'Patrol sudah disubmit',
      });
    }

    if (patrol.gpsValidationStatus !== GpsValidationStatus.VALID) {
      throw new UnprocessableEntityException({
        code: 'GPS_REQUIRED',
        message: 'GPS harus valid sebelum NFC dapat dibypass',
      });
    }

    if (patrol.nfcValidationStatus === NfcValidationStatus.VALID) {
      throw new UnprocessableEntityException({
        code: 'NFC_ALREADY_VALID',
        message: 'NFC patrol ini sudah valid',
      });
    }

    if (dto.reason === 'OTHER' && !dto.note?.trim()) {
      throw new UnprocessableEntityException({
        code: 'NFC_BYPASS_NOTE_REQUIRED',
        message: 'Catatan wajib diisi untuk alasan OTHER',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.patrol.update({
        where: { id: patrolId },
        data: {
          nfcValidationStatus: NfcValidationStatus.BYPASSED,
          nfcBypass: true,
          nfcBypassReason: dto.reason,
          nfcBypassNote: dto.note?.trim() || null,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'BYPASS_PATROL_NFC',
        entityType: 'Patrol',
        entityId: patrolId,
        oldData: {
          nfcValidationStatus: patrol.nfcValidationStatus,
          nfcBypass: patrol.nfcBypass,
          nfcBypassReason: patrol.nfcBypassReason,
          nfcBypassNote: patrol.nfcBypassNote,
        },
        newData: {
          nfcValidationStatus: result.nfcValidationStatus,
          nfcBypass: result.nfcBypass,
          nfcBypassReason: result.nfcBypassReason,
          nfcBypassNote: result.nfcBypassNote,
          gpsValidationStatus: result.gpsValidationStatus,
        },
      });

      return result;
    });

    return {
      patrolId: updated.id,
      nfcBypass: updated.nfcBypass,
      nfcValidationStatus: updated.nfcValidationStatus,
      bypassReason: updated.nfcBypassReason,
      bypassNote: updated.nfcBypassNote,
      gpsValidationStatus: updated.gpsValidationStatus,
    };
  }

  async validateLocation(
    patrolId: string,
    userId: string,
    dto: ValidateLocationDto,
  ) {
    const patrol = await this.prisma.patrol.findUnique({
      where: { id: patrolId },
      include: { patrolPoint: true },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke patrol ini',
      });
    }

    if (patrol.status === PatrolStatus.SUBMITTED) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ALREADY_SUBMITTED',
        message: 'Patrol sudah disubmit',
      });
    }

    const point = patrol.patrolPoint;

    const result = this.gpsValidationService.validate(
      dto.latitude,
      dto.longitude,
      Number(point.latitude),
      Number(point.longitude),
      point.radiusMeters,
      dto.accuracy,
    );

    const validationStatus = result.valid
      ? GpsValidationStatus.VALID
      : GpsValidationStatus.INVALID;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.patrol.update({
        where: { id: patrolId },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          gpsAccuracy: dto.accuracy ?? null,
          distanceFromPoint: result.distanceMeters,
          gpsValidationStatus: validationStatus,
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'VALIDATE_PATROL_GPS',
        entityType: 'Patrol',
        entityId: patrolId,
        oldData: {
          gpsValidationStatus: patrol.gpsValidationStatus,
          latitude: patrol.latitude,
          longitude: patrol.longitude,
          gpsAccuracy: patrol.gpsAccuracy,
          distanceFromPoint: patrol.distanceFromPoint,
        },
        newData: {
          gpsValidationStatus: updated.gpsValidationStatus,
          latitude: updated.latitude,
          longitude: updated.longitude,
          gpsAccuracy: updated.gpsAccuracy,
          distanceFromPoint: result.distanceMeters,
          radiusMeters: result.radiusMeters,
          accuracyMeters: result.accuracyMeters,
        },
      });
    });

    if (!result.valid) {
      throw new UnprocessableEntityException({
        code: 'GPS_OUTSIDE_RADIUS',
        message: 'Posisi Anda berada di luar radius patrol point',
        details: {
          distanceMeters: result.distanceMeters,
          radiusMeters: result.radiusMeters,
          accuracyMeters: result.accuracyMeters,
        },
      });
    }

    return {
      valid: true,
      distanceMeters: result.distanceMeters,
      radiusMeters: result.radiusMeters,
      accuracyMeters: result.accuracyMeters,
    };
  }

  async validateNfc(patrolId: string, userId: string, uid: string) {
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: patrolId,
      },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.gpsValidationStatus !== 'VALID') {
      throw new UnprocessableEntityException({
        code: 'GPS_REQUIRED',
        message: 'Validasi GPS harus berhasil sebelum scan NFC',
      });
    }

    return this.nfcValidationService.validate(patrolId, userId, uid);
  }

  async submitAnswers(patrolId: string, userId: string, dto: SubmitAnswersDto) {
    const patrol = await this.getPatrolForMutation(patrolId, userId);

    // this.ensureValidationComplete(patrol);

    const pointQuestions = await this.prisma.pointQuestion.findMany({
      where: {
        patrolPointId: patrol.patrolPointId,
      },
      include: {
        question: {
          include: { options: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const questionMap = new Map(
      pointQuestions.map((item) => [item.questionId, item]),
    );

    for (const answer of dto.answers) {
      const pointQuestion = questionMap.get(answer.questionId);

      if (!pointQuestion) {
        throw new BadRequestException({
          code: 'QUESTION_NOT_ALLOWED',
          message: 'Pertanyaan tidak berlaku untuk patrol point ini',
          questionId: answer.questionId,
        });
      }

      if (pointQuestion.question.questionType === 'SINGLE_CHOICE') {
        const option = pointQuestion.question.options.find(
          (item) => item.value === answer.answerValue,
        );

        if (!option) {
          throw new BadRequestException({
            code: 'INVALID_OPTION',
            message: 'Pilihan jawaban tidak valid',
            questionId: answer.questionId,
          });
        }
      }

      if (pointQuestion.question.questionType === 'YES_NO') {
        if (!['YES', 'NO'].includes(answer.answerValue ?? '')) {
          throw new BadRequestException({
            code: 'INVALID_YES_NO',
            message: 'Jawaban YES_NO harus YES atau NO',
            questionId: answer.questionId,
          });
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const changes: {
        questionId: string;
        oldValue: string | null;
        newValue: string | null;
      }[] = [];

      for (const answer of dto.answers) {
        const pointQuestion = questionMap.get(answer.questionId)!;

        const existing = await tx.patrolAnswer.findUnique({
          where: {
            patrolId_questionId: {
              patrolId,
              questionId: answer.questionId,
            },
          },
        });

        await tx.patrolAnswer.upsert({
          where: {
            patrolId_questionId: {
              patrolId,
              questionId: answer.questionId,
            },
          },
          create: {
            patrolId,
            questionId: answer.questionId,
            questionTextSnapshot: pointQuestion.question.questionText,
            answerValue: answer.answerValue ?? null,
            answerLabelSnapshot: answer.answerLabel ?? null,
          },
          update: {
            answerValue: answer.answerValue ?? null,
            answerLabelSnapshot: answer.answerLabel ?? null,
          },
        });

        changes.push({
          questionId: answer.questionId,
          oldValue: existing?.answerValue ?? null,
          newValue: answer.answerValue ?? null,
        });
      }

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'SUBMIT_PATROL_ANSWERS',
        entityType: 'Patrol',
        entityId: patrolId,
        oldData: {
          answerCount: changes.length,
          answers: changes.map((item) => ({
            questionId: item.questionId,
            answerValue: item.oldValue,
          })),
        },
        newData: {
          answerCount: changes.length,
          answers: changes.map((item) => ({
            questionId: item.questionId,
            answerValue: item.newValue,
          })),
        },
      });
    });

    return this.getPatrol(patrolId, userId);
  }

  async addPhoto(
    patrolId: string,
    userId: string,
    dto: SubmitPhotoDto,
    file: UploadedFile,
  ) {
    const patrol = await this.getPatrolForMutation(patrolId, userId);

    // this.ensureValidationComplete(patrol);

    if (!file) {
      throw new BadRequestException({
        code: 'PHOTO_REQUIRED',
        message: 'File foto wajib diupload.',
      });
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'File yang diupload harus berupa gambar.',
      });
    }

    if (!dto.answerId) {
      throw new BadRequestException({
        code: 'ANSWER_ID_REQUIRED',
        message: 'Foto wajib dikaitkan dengan jawaban pertanyaan.',
      });
    }

    const answer = await this.prisma.patrolAnswer.findFirst({
      where: {
        id: dto.answerId,
        patrolId,
      },
    });

    if (!answer) {
      throw new BadRequestException({
        code: 'ANSWER_NOT_FOUND',
        message: 'Jawaban tidak ditemukan pada patroli ini.',
      });
    }

    const uploadedFile = await this.storageService.saveImage(file);

    return this.prisma.$transaction(async (tx) => {
      const photo = await tx.patrolPhoto.create({
        data: {
          patrolId,
          answerId: answer.id,
          fileUrl: uploadedFile.url,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
        },
      });

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'UPLOAD_PATROL_PHOTO',
        entityType: 'PatrolPhoto',
        entityId: photo.id,
        newData: {
          patrolId,
          answerId: answer.id,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          fileSize: photo.fileSize,
          capturedAt: photo.capturedAt
            ? new Date(photo.capturedAt.toISOString())
            : new Date(),
        },
      });

      return photo;
    });
  }

  async submitPatrol(patrolId: string, userId: string) {
    const patrol = await this.getPatrolForMutation(patrolId, userId);

    // this.ensureValidationComplete(patrol);

    await this.validateRequiredAnswers(patrolId, patrol.patrolPointId);
    await this.validateRequiredPhotos(patrolId, patrol.patrolPointId);

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedPatrol = await tx.patrol.update({
        where: { id: patrolId },
        data: {
          status: PatrolStatus.SUBMITTED,
          completedAt: new Date(),
        },
      });

      let oldCheckpointStatus: PatrolCheckpointStatus | null = null;

      if (patrol.checkpointId) {
        const checkpoint = await tx.patrolCheckpoint.findUnique({
          where: { id: patrol.checkpointId },
          select: { status: true },
        });

        oldCheckpointStatus = checkpoint?.status ?? null;

        await tx.patrolCheckpoint.update({
          where: { id: patrol.checkpointId },
          data: {
            status: PatrolCheckpointStatus.COMPLETED,
            visitedAt: new Date(),
          },
        });
      }

      await this.auditLogService.createAudit(tx, {
        userId,
        action: 'SUBMIT_PATROL',
        entityType: 'Patrol',
        entityId: patrolId,
        oldData: {
          status: patrol.status,
          completedAt: patrol.completedAt?.toISOString() ?? null,
          checkpointId: patrol.checkpointId,
          checkpointStatus: oldCheckpointStatus,
        },
        newData: {
          status: updatedPatrol.status,
          completedAt: updatedPatrol.completedAt?.toISOString() ?? null,
          checkpointId: patrol.checkpointId,
          checkpointStatus: patrol.checkpointId
            ? PatrolCheckpointStatus.COMPLETED
            : null,
        },
      });

      return updatedPatrol;
    });

    if (patrol.checkpointId) {
      await this.updateRoundStatus(patrol.checkpoint!.round.id);
    }

    const unsafeAnswers = await this.findUnsafeAnswers(patrolId);

    if (unsafeAnswers.length > 0) {
      try {
        await this.emergencyService.broadcastPatrolWarning(userId, {
          siteId: patrol.siteId,
          reportNumber: result.reportNumber,
          patrolPointName: patrol.patrolPoint.name,
          unsafeAnswers,
        });
      } catch (error) {
        console.error('[PATROL WARNING] Gagal mengirim notifikasi FCM:', error);
      }
    }

    return this.getPatrol(result.id, userId);
  }

  private async validateRequiredAnswers(
    patrolId: string,
    patrolPointId: string,
  ) {
    const questions = await this.prisma.pointQuestion.findMany({
      where: {
        patrolPointId,
        isRequired: true,
      },
      include: {
        question: true,
      },
    });

    if (questions.length === 0) {
      return;
    }

    const answers = await this.prisma.patrolAnswer.findMany({
      where: {
        patrolId,
        questionId: {
          in: questions.map((item) => item.questionId),
        },
      },
    });

    const answerMap = new Map(
      answers.map((answer) => [answer.questionId, answer]),
    );

    const missing = questions.filter((item) => {
      const answer = answerMap.get(item.questionId);

      return !answer || !answer.answerValue?.trim();
    });

    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: 'REQUIRED_ANSWERS_MISSING',
        message: 'Masih ada pertanyaan wajib yang belum dijawab',
        questionIds: missing.map((item) => item.questionId),
      });
    }
  }

  private async validateRequiredPhotos(
    patrolId: string,
    patrolPointId: string,
  ) {
    const pointQuestions = await this.prisma.pointQuestion.findMany({
      where: { patrolPointId },
      include: {
        question: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    const answers = await this.prisma.patrolAnswer.findMany({
      where: { patrolId },
      include: {
        photos: {
          select: { id: true },
        },
      },
    });

    const answerMap = new Map(
      answers.map((answer) => [answer.questionId, answer]),
    );

    const missingAnswers: {
      questionId: string;
      question: string;
    }[] = [];

    const missingPhotos: {
      questionId: string;
      question: string;
      answerId: string | null;
    }[] = [];

    for (const pointQuestion of pointQuestions) {
      const answer = answerMap.get(pointQuestion.questionId);

      if (!answer || !answer.answerValue?.trim()) {
        missingAnswers.push({
          questionId: pointQuestion.questionId,
          question: pointQuestion.question.questionText,
        });

        continue;
      }

      if (answer.photos.length === 0) {
        missingPhotos.push({
          questionId: pointQuestion.questionId,
          question: answer.questionTextSnapshot,
          answerId: answer.id,
        });
      }
    }

    if (missingAnswers.length > 0 || missingPhotos.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PATROL_CHECKLIST_INCOMPLETE',
        message:
          'Setiap pertanyaan wajib dijawab dan disertai minimal satu foto.',
        missingAnswers,
        missingPhotos,
      });
    }
  }

  private async updateRoundStatus(roundId: string): Promise<void> {
    const round = await this.prisma.patrolRound.findUnique({
      where: { id: roundId },
      include: {
        checkpoints: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!round) {
      return;
    }

    const requiredCheckpoints = round.checkpoints.filter(
      (checkpoint) => checkpoint.required,
    );

    const completedCount = requiredCheckpoints.filter(
      (checkpoint) => checkpoint.status === 'COMPLETED',
    ).length;

    const allRequiredCompleted =
      requiredCheckpoints.length > 0 &&
      completedCount === requiredCheckpoints.length;

    let status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

    if (allRequiredCompleted) {
      status = 'COMPLETED';
    } else if (completedCount > 0) {
      status = 'IN_PROGRESS';
    } else {
      status = round.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'PENDING';
    }

    await this.prisma.patrolRound.update({
      where: { id: roundId },
      data: {
        status,
        ...(allRequiredCompleted ? { completedAt: new Date() } : {}),
      },
    });
  }

  private async getPatrolForMutation(patrolId: string, userId: string) {
    const patrol = await this.prisma.patrol.findUnique({
      where: {
        id: patrolId,
      },
      include: {
        patrolPoint: true,
        checkpoint: {
          include: {
            round: {
              include: {
                scheduleDate: {
                  include: {
                    schedule: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!patrol) {
      throw new NotFoundException({
        code: 'PATROL_NOT_FOUND',
        message: 'Patrol tidak ditemukan',
      });
    }

    if (patrol.userId !== userId) {
      throw new UnprocessableEntityException({
        code: 'PATROL_ACCESS_DENIED',
        message: 'Anda tidak memiliki akses ke patrol ini',
      });
    }

    if (
      patrol.status === PatrolStatus.SUBMITTED ||
      patrol.status === PatrolStatus.CANCELLED
    ) {
      throw new UnprocessableEntityException({
        code: 'PATROL_NOT_EDITABLE',
        message: 'Patrol sudah tidak dapat diubah',
      });
    }

    return patrol;
  }

  private ensureValidationComplete(patrol: {
    gpsValidationStatus: GpsValidationStatus;
    nfcValidationStatus: NfcValidationStatus;
  }) {
    if (patrol.gpsValidationStatus !== GpsValidationStatus.VALID) {
      throw new UnprocessableEntityException({
        code: 'GPS_REQUIRED',
        message: 'Validasi GPS belum berhasil',
      });
    }

    const nfcValid = patrol.nfcValidationStatus === NfcValidationStatus.VALID;

    const nfcBypassed =
      patrol.nfcValidationStatus === NfcValidationStatus.BYPASSED;

    if (!nfcValid && !nfcBypassed) {
      throw new UnprocessableEntityException({
        code: 'NFC_REQUIRED',
        message: 'NFC harus divalidasi atau dibypass terlebih dahulu',
      });
    }
  }

  private async generateReportNumber() {
    const now = new Date();

    const date = now.toISOString().slice(0, 10).replace(/-/g, '');

    const random = Math.random().toString(36).substring(2, 8).toUpperCase();

    return `PAT-${date}-${random}`;
  }

  private startOfToday(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    // Representasi tanggal kalender WIB pada tengah malam UTC.
    return new Date(
      `${values.year}-${values.month}-${values.day}T00:00:00.000Z`,
    );
  }

  private async findUnsafeAnswers(patrolId: string) {
    const answers = await this.prisma.patrolAnswer.findMany({
      where: { patrolId },
      include: {
        question: {
          include: { options: true },
        },
      },
    });

    return answers.flatMap((answer) => {
      const value = answer.answerValue?.trim();

      if (answer.question.questionType === 'YES_NO' && value === 'NO') {
        return [
          {
            question: answer.questionTextSnapshot,
            answer: answer.answerLabelSnapshot ?? value,
          },
        ];
      }

      if (answer.question.questionType === 'SINGLE_CHOICE') {
        const option = answer.question.options.find(
          (item) => item.value === value,
        );

        if (option && !option.isSafe) {
          return [
            {
              question: answer.questionTextSnapshot,
              answer: answer.answerLabelSnapshot ?? option.label,
            },
          ];
        }
      }

      return [];
    });
  }
}
