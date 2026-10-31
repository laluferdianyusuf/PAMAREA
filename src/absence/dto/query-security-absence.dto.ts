import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class QuerySecurityAbsenceDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
