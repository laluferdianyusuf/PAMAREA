import { ConflictException, Injectable } from '@nestjs/common';
import { ScheduleStatus } from '../../generated/prisma/enums.js';

@Injectable()
export class PatrolSchedulePolicy {
  assertEditable(status: ScheduleStatus) {
    if (status === ScheduleStatus.ARCHIVED) {
      throw new ConflictException('Archived schedule cannot be modified');
    }
  }

  assertDraft(status: ScheduleStatus) {
    if (status !== ScheduleStatus.DRAFT) {
      throw new ConflictException(
        'This operation is only allowed for DRAFT schedule',
      );
    }
  }

  assertCanActivate(
    status: ScheduleStatus,
    pointCount: number,
    dateCount: number,
    assignmentCount: number,
  ) {
    if (status !== ScheduleStatus.DRAFT) {
      throw new ConflictException('Only DRAFT schedule can be activated');
    }

    if (pointCount === 0) {
      throw new ConflictException(
        'Schedule must have at least one patrol point',
      );
    }

    if (dateCount === 0) {
      throw new ConflictException(
        'Schedule must have at least one schedule date',
      );
    }

    if (assignmentCount === 0) {
      throw new ConflictException(
        'Schedule must have at least one security assignment',
      );
    }
  }
}
