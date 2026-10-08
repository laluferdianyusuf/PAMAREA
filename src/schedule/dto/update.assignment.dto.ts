import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ScheduleAssignmentStatus } from '../../generated/prisma/enums.js';

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  endDate?: string | null;

  @IsOptional()
  @IsEnum(ScheduleAssignmentStatus)
  status?: ScheduleAssignmentStatus;
}
