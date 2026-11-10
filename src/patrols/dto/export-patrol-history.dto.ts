import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ExportPatrolHistoryDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
