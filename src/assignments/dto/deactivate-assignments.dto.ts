import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeactivatePatrolAssignmentDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
