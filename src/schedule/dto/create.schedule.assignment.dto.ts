import { IsDateString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateScheduleAssignmentDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
