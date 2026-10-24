import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PatrolRoundStatus,
  ScheduleAssignmentStatus,
} from '../../generated/prisma/enums.js';

import { PrismaService } from '../../prisma/prisma.service.js';
import { OptimizeAssignmentRouteDto } from '../dto/optimize-assignment-route.dto.js';
import { RedirectCheckpointDto } from '../dto/redirect-checkpoint.dto.js';
import { SetAssignmentRouteDto } from '../dto/set-assignment-route.dto.js';
import { PatrolSchedulePolicy } from '../policies/patrol.schedule.policy.service.js';

type RoutePointInput = {
  patrolPointId: string;
  required?: boolean;
};

type PatrolCoordinate = {
  id: string;
  name: string;
  latitude: number | { toNumber(): number };
  longitude: number | { toNumber(): number };
};

@Injectable()
export class PatrolScheduleAssignmentRouteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PatrolSchedulePolicy,
  ) {}

  async getRoute(assignmentId: string) {
    const assignment = await this.prisma.patrolScheduleAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        schedule: {
          include: {
            points: {
              orderBy: { sequence: 'asc' },
              include: { patrolPoint: true },
            },
          },
        },
        patrolPoints: {
          orderBy: { sequence: 'asc' },
          include: { patrolPoint: true },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment tidak ditemukan');
    }

    const hasCustomRoute = assignment.patrolPoints.length > 0;
    const points = hasCustomRoute
      ? assignment.patrolPoints
      : assignment.schedule.points;

    return {
      assignmentId,
      source: hasCustomRoute ? 'ASSIGNMENT' : 'SCHEDULE_DEFAULT',
      points: points.map((item) => ({
        patrolPointId: item.patrolPointId,
        name: item.patrolPoint.name,
        sequence: item.sequence,
        required: item.required,
      })),
    };
  }

  async setRoute(assignmentId: string, dto: SetAssignmentRouteDto) {
    const points: RoutePointInput[] = dto.points;

    this.validateUniquePoints(points.map((point) => point.patrolPointId));

    const assignment = await this.loadAssignment(assignmentId);
    this.assertScheduleEditable(assignment.schedule.status);

    const allowedIds = new Set(
      assignment.schedule.points.map((point) => point.patrolPointId),
    );

    this.assertAllowedPoints(
      points.map((point) => point.patrolPointId),
      allowedIds,
    );

    await this.saveRouteAndSyncPending(assignmentId, points);

    return this.getRoute(assignmentId);
  }

  async optimizeRoute(assignmentId: string, dto: OptimizeAssignmentRouteDto) {
    this.validateUniquePoints(dto.patrolPointIds);

    if (!dto.patrolPointIds.includes(dto.startPatrolPointId)) {
      throw new BadRequestException(
        'Titik awal harus termasuk dalam patrolPointIds',
      );
    }

    const assignment = await this.loadAssignment(assignmentId);
    this.assertScheduleEditable(assignment.schedule.status);

    const allowedIds = new Set(
      assignment.schedule.points.map((point) => point.patrolPointId),
    );

    this.assertAllowedPoints(dto.patrolPointIds, allowedIds);

    const patrolPoints = await this.prisma.patrolPoint.findMany({
      where: {
        id: { in: dto.patrolPointIds },
        siteId: assignment.schedule.siteId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
      },
    });

    if (patrolPoints.length !== dto.patrolPointIds.length) {
      throw new BadRequestException(
        'Ada titik patroli yang tidak ditemukan, tidak aktif, atau berbeda site',
      );
    }

    const pointById = new Map(
      patrolPoints.map((point) => [point.id, point as PatrolCoordinate]),
    );

    for (const point of patrolPoints) {
      const latitude = Number(point.latitude);
      const longitude = Number(point.longitude);

      if (
        point.latitude == null ||
        point.longitude == null ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new BadRequestException(
          `Koordinat titik ${point.name} belum valid`,
        );
      }
    }

    const optimizedIds = this.nearestNeighbor(
      dto.startPatrolPointId,
      dto.patrolPointIds,
      pointById,
    );

    const route: RoutePointInput[] = optimizedIds.map((patrolPointId) => ({
      patrolPointId,
      required: true,
    }));

    await this.saveRouteAndSyncPending(assignmentId, route);

    return {
      assignmentId,
      algorithm: 'NEAREST_NEIGHBOR',
      startPatrolPointId: dto.startPatrolPointId,
      // Belum menambahkan checkpoint pulang karena checkpoint
      // unik per titik dalam satu ronde.
      returnToStart: false,
      points: optimizedIds.map((id, index) => ({
        patrolPointId: id,
        name: pointById.get(id)!.name,
        sequence: index + 1,
      })),
    };
  }

  async redirectCheckpoint(
    roundId: string,
    checkpointId: string,
    dto: RedirectCheckpointDto,
    changedById: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const round = await tx.patrolRound.findUnique({
          where: { id: roundId },
          include: {
            assignment: {
              include: {
                schedule: {
                  include: { points: true },
                },
              },
            },
            checkpoints: true,
          },
        });

        if (!round) {
          throw new NotFoundException('Ronde patroli tidak ditemukan');
        }

        if (round.status !== PatrolRoundStatus.IN_PROGRESS) {
          throw new ConflictException(
            'Pengalihan hanya boleh dilakukan pada ronde IN_PROGRESS',
          );
        }

        if (round.assignment.status !== ScheduleAssignmentStatus.ACTIVE) {
          throw new ConflictException('Assignment tidak aktif');
        }

        const checkpoint = round.checkpoints.find(
          (item) => item.id === checkpointId,
        );

        if (!checkpoint) {
          throw new NotFoundException(
            'Checkpoint tidak ditemukan pada ronde tersebut',
          );
        }

        if (checkpoint.status !== 'PENDING') {
          throw new ConflictException(
            'Hanya checkpoint PENDING yang dapat dialihkan',
          );
        }

        const targetIsConfigured = round.assignment.schedule.points.some(
          (point) => point.patrolPointId === dto.targetPatrolPointId,
        );

        if (!targetIsConfigured) {
          throw new BadRequestException(
            'Titik tujuan harus termasuk dalam rute default jadwal',
          );
        }

        const target = await tx.patrolPoint.findFirst({
          where: {
            id: dto.targetPatrolPointId,
            siteId: round.assignment.schedule.siteId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            code: true,
            name: true,
            radiusMeters: true,
          },
        });

        if (!target) {
          throw new BadRequestException(
            'Titik tujuan tidak aktif atau berbeda site',
          );
        }

        if (checkpoint.patrolPointId === target.id) {
          throw new BadRequestException(
            'Titik tujuan sama dengan titik saat ini',
          );
        }

        const duplicate = round.checkpoints.some(
          (item) =>
            item.id !== checkpoint.id && item.patrolPointId === target.id,
        );

        if (duplicate) {
          throw new ConflictException('Titik tujuan sudah ada pada ronde ini');
        }

        await tx.patrolCheckpoint.update({
          where: { id: checkpoint.id },
          data: {
            patrolPointId: target.id,
            pointCodeSnapshot: target.code,
            pointNameSnapshot: target.name,
            radiusMetersSnapshot: target.radiusMeters,
          },
        });

        // Audit permanen belum disimpan. changedById dan reason
        // dikembalikan agar controller tetap bisa meneruskan konteks.
        return {
          message: 'Checkpoint berhasil dialihkan',
          roundId,
          checkpointId,
          fromPatrolPointId: checkpoint.patrolPointId,
          toPatrolPointId: target.id,
          toPatrolPointName: target.name,
          reason: dto.reason,
          changedById,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async loadAssignment(assignmentId: string) {
    const assignment = await this.prisma.patrolScheduleAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        schedule: {
          include: {
            points: {
              orderBy: { sequence: 'asc' },
            },
          },
        },
        rounds: {
          include: {
            checkpoints: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment tidak ditemukan');
    }

    if (assignment.status !== ScheduleAssignmentStatus.ACTIVE) {
      throw new ConflictException('Assignment tidak aktif');
    }

    return assignment;
  }

  private assertScheduleEditable(status: any) {
    this.policy.assertEditable(status);
  }

  private assertAllowedPoints(ids: string[], allowedIds: Set<string>) {
    for (const id of ids) {
      if (!allowedIds.has(id)) {
        throw new BadRequestException(
          `Titik ${id} tidak termasuk dalam rute default jadwal`,
        );
      }
    }
  }

  private validateUniquePoints(ids: string[]) {
    if (ids.length === 0) {
      throw new BadRequestException('Rute wajib memiliki minimal satu titik');
    }

    if (new Set(ids).size !== ids.length) {
      throw new ConflictException('Titik patroli tidak boleh duplikat');
    }
  }

  private async saveRouteAndSyncPending(
    assignmentId: string,
    points: RoutePointInput[],
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const assignment = await tx.patrolScheduleAssignment.findUnique({
          where: { id: assignmentId },
          include: {
            schedule: {
              include: {
                points: {
                  orderBy: { sequence: 'asc' },
                  include: { patrolPoint: true },
                },
              },
            },
            rounds: {
              include: { checkpoints: true },
            },
          },
        });

        if (!assignment) {
          throw new NotFoundException('Assignment tidak ditemukan');
        }

        if (assignment.status !== ScheduleAssignmentStatus.ACTIVE) {
          throw new ConflictException('Assignment tidak aktif');
        }

        this.policy.assertEditable(assignment.schedule.status);

        const allowedIds = new Set(
          assignment.schedule.points.map((point) => point.patrolPointId),
        );

        this.assertAllowedPoints(
          points.map((point) => point.patrolPointId),
          allowedIds,
        );

        // Validasi koordinat tidak diperlukan untuk rute manual.
        // Titik harus tetap berada pada site dan konfigurasi jadwal.
        const pendingRounds = assignment.rounds.filter(
          (round) =>
            round.status === PatrolRoundStatus.PENDING &&
            round.checkpoints.every(
              (checkpoint) => checkpoint.status === 'PENDING',
            ),
        );

        await tx.patrolScheduleAssignmentPoint.deleteMany({
          where: { assignmentId },
        });

        await tx.patrolScheduleAssignmentPoint.createMany({
          data: points.map((point, index) => ({
            assignmentId,
            patrolPointId: point.patrolPointId,
            sequence: index + 1,
            required: point.required ?? true,
          })),
        });

        const pointIds = points.map((point) => point.patrolPointId);

        const patrolPoints = await tx.patrolPoint.findMany({
          where: {
            id: { in: pointIds },
            siteId: assignment.schedule.siteId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            code: true,
            name: true,
            radiusMeters: true,
          },
        });

        if (patrolPoints.length !== pointIds.length) {
          throw new BadRequestException(
            'Ada titik yang tidak aktif, tidak ditemukan, atau berbeda site',
          );
        }

        const patrolPointById = new Map(
          patrolPoints.map((point) => [point.id, point]),
        );

        for (const round of pendingRounds) {
          await tx.patrolCheckpoint.deleteMany({
            where: { roundId: round.id },
          });

          await tx.patrolCheckpoint.createMany({
            data: points.map((point, index) => {
              const patrolPoint = patrolPointById.get(point.patrolPointId);

              if (!patrolPoint) {
                throw new BadRequestException(
                  `Titik ${point.patrolPointId} tidak ditemukan`,
                );
              }

              return {
                roundId: round.id,
                patrolPointId: point.patrolPointId,
                sequence: index + 1,
                required: point.required ?? true,
                pointCodeSnapshot: patrolPoint.code,
                pointNameSnapshot: patrolPoint.name,
                radiusMetersSnapshot: patrolPoint.radiusMeters,
              };
            }),
          });
        }
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private nearestNeighbor(
    startId: string,
    inputIds: string[],
    pointById: Map<string, PatrolCoordinate>,
  ): string[] {
    const remaining = new Set(inputIds);
    const result = [startId];

    remaining.delete(startId);

    let currentId = startId;

    while (remaining.size > 0) {
      const current = pointById.get(currentId)!;
      let nearestId: string | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const candidateId of remaining) {
        const candidate = pointById.get(candidateId)!;

        const distance = this.haversine(
          Number(current.latitude),
          Number(current.longitude),
          Number(candidate.latitude),
          Number(candidate.longitude),
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestId = candidateId;
        }
      }

      if (!nearestId) {
        break;
      }

      result.push(nearestId);
      remaining.delete(nearestId);
      currentId = nearestId;
    }

    return result;
  }

  private haversine(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number,
  ): number {
    const toRadians = (degree: number) => (degree * Math.PI) / 180;

    const earthRadiusMeters = 6_371_000;
    const deltaLatitude = toRadians(latitude2 - latitude1);
    const deltaLongitude = toRadians(longitude2 - longitude1);

    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(toRadians(latitude1)) *
        Math.cos(toRadians(latitude2)) *
        Math.sin(deltaLongitude / 2) ** 2;

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
