import { IsDateString, IsOptional } from 'class-validator';

export class UpdatePatrolAssignmentDto {
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string | null;
}
