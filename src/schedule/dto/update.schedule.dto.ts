import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdatePatrolScheduleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  gracePeriodMinutes?: number;

  @IsOptional()
  @IsBoolean()
  enforceSequence?: boolean;
}
