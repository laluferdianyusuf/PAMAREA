import { IsDateString, IsOptional } from 'class-validator';

export class GenerateScheduleDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  force?: boolean;
}
