import { IsDateString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreatePatrolAssignmentDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsUUID()
  @IsNotEmpty()
  patrolPointId: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
