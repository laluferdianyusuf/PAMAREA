import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class SchedulePointInput {
  @IsUUID('4')
  patrolPointId: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

class ScheduleAssignmentInput {
  @IsUUID('4')
  userId: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreatePatrolScheduleDto {
  @IsUUID('4')
  siteId: string;

  @IsString()
  name: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime: string;

  @IsInt()
  @Min(1)
  intervalMinutes: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  gracePeriodMinutes?: number;

  @IsOptional()
  @IsBoolean()
  enforceSequence?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SchedulePointInput)
  points: SchedulePointInput[];

  @IsArray()
  @ArrayMinSize(1)
  @IsDateString({}, { each: true })
  dates: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleAssignmentInput)
  assignments: ScheduleAssignmentInput[];
}
