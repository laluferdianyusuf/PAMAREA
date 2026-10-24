import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class OptimizeAssignmentRouteDto {
  @IsUUID()
  startPatrolPointId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  patrolPointIds: string[];

  @IsOptional()
  @IsBoolean()
  returnToStart?: boolean;
}
