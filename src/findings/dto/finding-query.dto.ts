import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  FindingSeverity,
  FindingStatus,
} from '../../generated/prisma/enums.js';

export class FindingQueryDto {
  @IsEnum(FindingStatus)
  @IsOptional()
  status?: FindingStatus;

  @IsEnum(FindingSeverity)
  @IsOptional()
  severity?: FindingSeverity;

  @IsUUID()
  @IsOptional()
  patrolId?: string;

  @IsUUID()
  @IsOptional()
  patrolPointId?: string;

  @IsUUID()
  @IsOptional()
  reportedBy?: string;

  @IsUUID()
  @IsOptional()
  assignedTo?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;
}
